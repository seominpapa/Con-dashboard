import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'
import { ok, fail } from '../../../shared/types/common'
import { PUBLIC_API_PROVIDERS, type PublicApiProviderKey } from '../../../shared/types/integration'
import type { Site } from '../../../shared/types/site'

const app = new Hono<AppEnv>()

// 연결 테스트용 임의 현장 (서울시청 기준) - 실제 API 연동 여부만 확인하는 용도
const TEST_SITE: Site = {
  id: 'test-site',
  name: '연결 테스트',
  company: '',
  address: '서울특별시 중구 태평로1가',
  latitude: 37.5663,
  longitude: 126.9779,
  kmaNx: 60,
  kmaNy: 127,
  startDate: '',
  endDate: '',
  status: 'active',
}

const ENV_VAR_MAP: Record<PublicApiProviderKey, string[]> = {
  kma: ['KMA_SERVICE_KEY'],
  airkorea: ['AIRKOREA_SERVICE_KEY'],
  g2b: ['G2B_SERVICE_KEY'],
  law: ['LAW_API_KEY'],
  ecos: ['ECOS_API_KEY'],
  opinet: ['OPINET_API_KEY'],
  naver: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'],
}

/** 실제 Provider를 통해 최소 호출을 수행하여 연결이 유효한지 확인한다 */
async function testPublicProvider(env: any, provider: PublicApiProviderKey): Promise<{ ok: boolean; message?: string }> {
  try {
    switch (provider) {
      case 'kma': {
        const { getWeatherProvider } = await import('../../providers/weather')
        const p = await getWeatherProvider(env)
        await p.getCurrentWeather(TEST_SITE)
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      case 'airkorea': {
        const { getAirQualityProvider } = await import('../../providers/air-quality')
        const p = await getAirQualityProvider(env)
        await p.getCurrentAirQuality(TEST_SITE)
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      case 'g2b': {
        const { getBidProvider } = await import('../../providers/bidding')
        const p = await getBidProvider(env)
        await p.searchBids({}, 1)
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      case 'law': {
        const { getLawProvider } = await import('../../providers/laws')
        const p = await getLawProvider(env)
        await p.getLaws(['건설산업기본법'])
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      case 'ecos': {
        const { getExchangeRateProvider } = await import('../../providers/exchange')
        const p = await getExchangeRateProvider(env)
        await p.getRates(['USD'])
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      case 'opinet': {
        const { getOilPriceProvider } = await import('../../providers/oil')
        const p = await getOilPriceProvider(env)
        await p.getPrices(['domestic-diesel'])
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      case 'naver': {
        const { getNewsProvider } = await import('../../providers/news')
        const p = await getNewsProvider(env)
        await p.getNews([], 1)
        return { ok: true, message: `연결 확인 완료 (source: ${p.source})` }
      }
      default:
        return { ok: false, message: '알 수 없는 provider' }
    }
  } catch (err: any) {
    return { ok: false, message: err.message }
  }
}

// GET /api/admin/integrations - 공공데이터 Provider 전체 연결 상태
app.get('/', async (c) => {
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const summaries = await repo.listSummaries()
  const byProvider = new Map(summaries.map((s) => [s.provider, s]))

  const result = PUBLIC_API_PROVIDERS.map((p) => {
    const summary = byProvider.get(p.key)
    const envFallbackAvailable = ENV_VAR_MAP[p.key].every((v) => Boolean((c.env as any)[v]))
    return {
      provider: p.key,
      label: p.label,
      envVar: p.envVar,
      status: summary?.status ?? (envFallbackAvailable ? 'CONNECTED' : 'DISCONNECTED'),
      connectedAt: summary?.connectedAt ?? null,
      lastCheckedAt: summary?.lastCheckedAt ?? null,
      lastSuccessAt: summary?.lastSuccessAt ?? null,
      lastError: summary?.lastError ?? null,
      envFallbackAvailable,
      dbConfigured: Boolean(summary?.connectedAt),
    }
  })
  return c.json(ok(result, 'live'))
})

// POST /api/admin/integrations/:provider/connect  body: { credential: {...} }
app.post('/:provider/connect', async (c) => {
  const admin = c.get('currentUser')!
  const provider = c.req.param('provider') as PublicApiProviderKey
  const meta = PUBLIC_API_PROVIDERS.find((p) => p.key === provider)
  if (!meta) return c.json(fail('알 수 없는 provider', 'live'), 400)

  const body = await c.req.json().catch(() => ({}))
  const credential = body.credential ?? {}
  if (Object.keys(credential).length === 0) {
    return c.json(fail('credential 값이 필요합니다', 'live'), 400)
  }

  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.upsertCredential({ provider, type: 'public_api', credential, updatedBy: admin.id })

  const testResult = await testPublicProvider(c.env, provider)
  await repo.recordCheckResult(provider, testResult.ok, testResult.ok ? undefined : testResult.message)

  return c.json(ok({ provider, testResult }, 'live'))
})

// POST /api/admin/integrations/:provider/test - 현재 설정(DB 또는 ENV)으로 연결 테스트
app.post('/:provider/test', async (c) => {
  const provider = c.req.param('provider') as PublicApiProviderKey
  const meta = PUBLIC_API_PROVIDERS.find((p) => p.key === provider)
  if (!meta) return c.json(fail('알 수 없는 provider', 'live'), 400)

  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const testResult = await testPublicProvider(c.env, provider)
  await repo.recordCheckResult(provider, testResult.ok, testResult.ok ? undefined : testResult.message)
  return c.json(ok({ provider, testResult }, 'live'))
})

// POST /api/admin/integrations/:provider/disconnect
app.post('/:provider/disconnect', async (c) => {
  const admin = c.get('currentUser')!
  const provider = c.req.param('provider') as PublicApiProviderKey
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.disconnect(provider, admin.id)
  return c.json(ok({ provider }, 'live'))
})

export default app
