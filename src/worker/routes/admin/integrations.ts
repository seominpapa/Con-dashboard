import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'
import { ok, fail } from '../../../shared/types/common'
import { PUBLIC_API_PROVIDERS, type PublicApiProviderKey } from '../../../shared/types/integration'
import type { Site } from '../../../shared/types/site'
import { publicProviderFailureMessage, validatePublicCredential } from '../../integrations/publicCredentials'
import { NaverMapsApiError, NaverMapsGeocodingProvider } from '../../providers/geocoding/NaverMapsGeocodingProvider'
import { todayKeySeoul } from '../../../shared/utils/timezone'
import { SettingsRepository } from '../../repositories/SettingsRepository'
import { PpsApiError } from '../../providers/materials/PpsMaterialPriceProvider'
import { getMaterialPriceCredential } from '../../providers/materials'

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
  kma_alert: ['KMA_ALERT_SERVICE_KEY', 'KMA_SERVICE_KEY'],
  airkorea: ['AIRKOREA_SERVICE_KEY'],
  airkorea_station: ['AIRKOREA_STATION_SERVICE_KEY'],
  g2b: ['G2B_SERVICE_KEY'],
  material_prices: ['MATERIAL_PRICE_SERVICE_KEY', 'G2B_SERVICE_KEY'],
  law: ['LAW_OC'],
  ecos: ['ECOS_API_KEY'],
  naver_maps: ['NAVER_MAP_CLIENT_ID', 'NAVER_MAP_CLIENT_SECRET'],
  naver_dynamic_map: ['NAVER_DYNAMIC_MAP_CLIENT_ID'],
  its: ['ITS_API_KEY'],
}

function getEnvCredential(env: AppEnv['Bindings'], provider: PublicApiProviderKey): Record<string, string> | null {
  if (provider === 'naver_dynamic_map') {
    return env.NAVER_DYNAMIC_MAP_CLIENT_ID ? { clientId: env.NAVER_DYNAMIC_MAP_CLIENT_ID } : null
  }
  if (provider === 'kma_alert') {
    const apiKey = env.KMA_ALERT_SERVICE_KEY || env.KMA_SERVICE_KEY
    return apiKey ? { apiKey } : null
  }
  if (provider === 'law') {
    const oc = env.LAW_OC || env.LAW_API_KEY
    return oc ? { oc } : null
  }
  if (provider === 'naver_maps') {
    return env.NAVER_MAP_CLIENT_ID && env.NAVER_MAP_CLIENT_SECRET
      ? { clientId: env.NAVER_MAP_CLIENT_ID, clientSecret: env.NAVER_MAP_CLIENT_SECRET }
      : null
  }
  if (provider === 'material_prices') {
    const apiKey = env.MATERIAL_PRICE_SERVICE_KEY || env.G2B_SERVICE_KEY
    return apiKey ? { apiKey } : null
  }
  const value = env[ENV_VAR_MAP[provider][0] as keyof AppEnv['Bindings']]
  return typeof value === 'string' && value ? { apiKey: value } : null
}

/** 폴백 없이 지정된 자격증명 자체로 최소 호출을 수행한다. */
async function testPublicCredential(provider: PublicApiProviderKey, credential: Record<string, string>): Promise<{ ok: boolean; message?: string }> {
  try {
    switch (provider) {
      case 'naver_dynamic_map':
        return { ok: true, message: 'Client ID 형식 확인 완료. 실제 지도 연결은 대시보드 브라우저에서 확인합니다. Dynamic Map 활성화와 Web 서비스 URL 등록이 필요합니다.' }
      case 'kma': {
        const { KmaWeatherProvider } = await import('../../providers/weather/KmaWeatherProvider')
        const p = new KmaWeatherProvider(credential.apiKey)
        await p.getCurrentWeather(TEST_SITE)
        break
      }
      case 'kma_alert': {
        const { KmaWeatherProvider } = await import('../../providers/weather/KmaWeatherProvider')
        await new KmaWeatherProvider(credential.apiKey).getAlerts(TEST_SITE)
        break
      }
      case 'airkorea': {
        const { AirKoreaProvider } = await import('../../providers/air-quality/AirKoreaProvider')
        const p = new AirKoreaProvider(credential.apiKey)
        await p.getCurrentAirQuality(TEST_SITE)
        break
      }
      case 'airkorea_station': {
        const { AirKoreaProvider } = await import('../../providers/air-quality/AirKoreaProvider')
        await new AirKoreaProvider(credential.apiKey).healthCheckStations()
        break
      }
      case 'g2b': {
        const { G2bBidProvider } = await import('../../providers/bidding/G2bBidProvider')
        const p = new G2bBidProvider(credential.apiKey)
        await p.searchBids({}, 1)
        break
      }
      case 'material_prices': {
        const { PpsMaterialPriceProvider } = await import('../../providers/materials/PpsMaterialPriceProvider')
        const p = new PpsMaterialPriceProvider(credential.apiKey)
        return { ok: true, message: await p.healthCheck() }
      }
      case 'law': {
        const { NlicLawProvider } = await import('../../providers/laws/NlicLawProvider')
        const p = new NlicLawProvider(credential.oc)
        await p.getLaws(['건설산업기본법'])
        break
      }
      case 'ecos': {
        const { EcosExchangeRateProvider } = await import('../../providers/exchange/EcosExchangeRateProvider')
        const p = new EcosExchangeRateProvider(credential.apiKey)
        await p.getRates(['USD'])
        break
      }
      case 'naver_maps': {
        const p = new NaverMapsGeocodingProvider(credential.clientId, credential.clientSecret)
        await p.geocode(TEST_SITE.address)
        break
      }
      case 'its': {
        const { ItsTrafficProvider } = await import('../../providers/traffic/ItsTrafficProvider')
        const p = new ItsTrafficProvider(credential.apiKey)
        const result = await p.getNearbyTraffic(TEST_SITE)
        if (!result.roadsAvailable || !result.incidentsAvailable) return { ok: false, message: 'ITS 교통소통정보와 돌발상황정보 모두에 대한 활용신청 승인이 필요합니다' }
        break
      }
    }
    return { ok: true, message: '실제 API 연결 확인 완료' }
  } catch (error) {
    if (provider === 'material_prices' && error instanceof PpsApiError) return { ok: false, message: error.message }
    if (provider === 'naver_maps' && error instanceof NaverMapsApiError) return { ok: false, message: error.message }
    return { ok: false, message: publicProviderFailureMessage(provider) }
  }
}

function parseExpiryDate(value: unknown): { valid: true; value: string | null } | { valid: false } {
  if (value === undefined || value === null || value === '') return { valid: true, value: null }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return { valid: false }
  return { valid: true, value }
}

function daysBetweenDateKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000)
}

function parseManagementMetadata(body: Record<string, unknown>): Record<string, unknown> {
  const expiry = parseExpiryDate(body.expiresAt)
  if (!expiry.valid) throw new Error('만료일은 실제 존재하는 YYYY-MM-DD 날짜여야 합니다')
  if (body.noExpiry !== undefined && typeof body.noExpiry !== 'boolean') throw new Error('만료 없음 설정은 참/거짓이어야 합니다')
  if (body.noExpiry === true && expiry.value) throw new Error('만료 없음과 만료일을 동시에 지정할 수 없습니다')
  if (body.memo !== undefined && (typeof body.memo !== 'string' || body.memo.length > 2000)) throw new Error('메모는 2000자 이하의 문자열이어야 합니다')
  return {
    ...(body.expiresAt !== undefined ? { expiresAt: expiry.value, ...(expiry.value ? { noExpiry: false } : {}) } : {}),
    ...(body.noExpiry !== undefined ? { noExpiry: body.noExpiry } : {}),
    ...(body.noExpiry === true ? { expiresAt: null } : {}),
    ...(typeof body.memo === 'string' ? { memo: body.memo.trim() } : {}),
  }
}

// GET /api/admin/integrations - 공공데이터 Provider 전체 연결 상태
app.get('/', async (c) => {
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const summaries = await repo.listSummaries()
  const byProvider = new Map(summaries.map((s) => [s.provider, s]))

  const result = PUBLIC_API_PROVIDERS.map((p) => {
    const summary = byProvider.get(p.key)
    const envFallbackAvailable = Boolean(getEnvCredential(c.env, p.key))
    const fallbackProvider = p.key === 'material_prices' ? 'g2b' : p.key === 'kma_alert' ? 'kma' : null
    const credentialFallbackAvailable = Boolean(fallbackProvider && !summary?.connectedAt && byProvider.get(fallbackProvider)?.connectedAt)
    const expiresAt = summary?.expiresAt ?? null
    const daysUntilExpiry = expiresAt ? daysBetweenDateKeys(todayKeySeoul(), expiresAt) : null
    return {
      provider: p.key,
      label: p.label,
      envVar: p.envVar,
      docsUrl: p.docsUrl,
      status: daysUntilExpiry !== null && daysUntilExpiry < 0
        ? 'EXPIRED'
        : p.key === 'kma_alert' || p.key === 'material_prices' ? summary?.status ?? 'DISCONNECTED'
        : credentialFallbackAvailable || (envFallbackAvailable && !summary?.connectedAt && !summary?.lastCheckedAt)
          ? 'CONNECTED' : summary?.status ?? (envFallbackAvailable ? 'CONNECTED' : 'DISCONNECTED'),
      connectedAt: summary?.connectedAt ?? null,
      lastCheckedAt: summary?.lastCheckedAt ?? null,
      lastSuccessAt: summary?.lastSuccessAt ?? null,
      lastError: summary?.lastError ?? null,
      envFallbackAvailable,
      credentialFallbackAvailable,
      dbConfigured: Boolean(summary?.connectedAt),
      expiresAt,
      daysUntilExpiry,
      noExpiry: summary?.metadata?.noExpiry === true,
      memo: typeof summary?.metadata?.memo === 'string' ? summary.metadata.memo : '',
    }
  })
  return c.json(ok(result, 'live'))
})

// 키 재입력·복호화·외부 연결 테스트 없이 관리자 관리정보만 수정한다.
app.patch('/:provider/metadata', async (c) => {
  const provider = c.req.param('provider')
  if (!PUBLIC_API_PROVIDERS.some((p) => p.key === provider)) return c.json(fail('알 수 없는 provider', 'live'), 400)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
    || Object.keys(body).some((key) => !['expiresAt', 'noExpiry', 'memo'].includes(key))) {
    return c.json(fail('만료일, 만료 없음, 메모만 수정할 수 있습니다', 'live'), 400)
  }
  let metadata
  try { metadata = parseManagementMetadata(body) } catch (error) {
    return c.json(fail((error as Error).message, 'live'), 400)
  }
  const admin = c.get('currentUser')!
  if (!await new SettingsRepository(c.env.DB).consumeFixedWindow(`integration_metadata:${admin.id}`, 30, 60)) {
    return c.json(fail('변경 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', 'live'), 429)
  }
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.ensureRow(provider, 'public_api')
  await repo.updateMetadata(provider, metadata, admin.id)
  return c.json(ok({ provider, saved: true }, 'live'))
})

// POST /api/admin/integrations/:provider/connect  body: { credential: {...} }
app.post('/:provider/connect', async (c) => {
  const admin = c.get('currentUser')!
  const provider = c.req.param('provider') as PublicApiProviderKey
  const meta = PUBLIC_API_PROVIDERS.find((p) => p.key === provider)
  if (!meta) return c.json(fail('알 수 없는 provider', 'live'), 400)

  const body = await c.req.json().catch(() => ({}))
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json(fail('요청 형식이 올바르지 않습니다', 'live'), 400)
  let metadata
  try { metadata = parseManagementMetadata(body) } catch (error) {
    return c.json(fail((error as Error).message, 'live'), 400)
  }
  const validation = validatePublicCredential(provider, body.credential)
  if (!validation.valid) return c.json(fail(validation.message, 'live'), 400)

  const testResult = await testPublicCredential(provider, validation.credential)
  if (!testResult.ok) return c.json(fail(testResult.message ?? '외부 API 연결에 실패했습니다', 'live'), 400)

  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const previous = await repo.getSummary(provider)
  await repo.upsertCredential({
    provider,
    type: 'public_api',
    credential: validation.credential,
    metadata: { ...previous?.metadata, ...metadata },
    updatedBy: admin.id,
  })
  if (provider !== 'naver_dynamic_map') await repo.recordCheckResult(provider, true)

  return c.json(ok({ provider, testResult }, 'live'))
})

// POST /api/admin/integrations/:provider/test - 현재 설정(DB 또는 ENV)으로 연결 테스트
app.post('/:provider/test', async (c) => {
  const provider = c.req.param('provider') as PublicApiProviderKey
  const meta = PUBLIC_API_PROVIDERS.find((p) => p.key === provider)
  if (!meta) return c.json(fail('알 수 없는 provider', 'live'), 400)

  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  let stored: Record<string, string> | null = null
  try {
    stored = provider === 'material_prices'
      ? await getMaterialPriceCredential(c.env)
      : await repo.getDecryptedCredential<Record<string, string>>(provider)
  } catch {
    return c.json(fail('저장된 자격증명을 복호화할 수 없습니다. 다시 연결해 주세요.', 'live'), 400)
  }
  if (provider === 'law' && stored?.apiKey && !stored.oc) stored = { oc: stored.apiKey }
  if (provider === 'kma_alert' && !stored && !c.env.KMA_ALERT_SERVICE_KEY) {
    try { stored = await repo.getDecryptedCredential<Record<string, string>>('kma') } catch {
      return c.json(fail('기상청 자격증명을 복호화할 수 없습니다. 기상특보 키를 등록해 주세요.', 'live'), 400)
    }
  }
  const validation = validatePublicCredential(provider, stored ?? getEnvCredential(c.env, provider))
  if (!validation.valid) return c.json(fail('연결된 자격증명이 없습니다', 'live'), 400)

  const testResult = await testPublicCredential(provider, validation.credential)
  await repo.ensureRow(provider, 'public_api')
  if (provider !== 'naver_dynamic_map') await repo.recordCheckResult(provider, testResult.ok, testResult.ok ? undefined : testResult.message)
  return c.json(ok({ provider, testResult }, 'live'))
})

// POST /api/admin/integrations/:provider/disconnect
app.post('/:provider/disconnect', async (c) => {
  const admin = c.get('currentUser')!
  const provider = c.req.param('provider') as PublicApiProviderKey
  if (!PUBLIC_API_PROVIDERS.some((item) => item.key === provider)) return c.json(fail('알 수 없는 provider', 'live'), 400)
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.disconnect(provider, admin.id)
  return c.json(ok({ provider }, 'live'))
})

export default app
