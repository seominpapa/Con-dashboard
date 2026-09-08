import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getMaterialPriceProvider } from '../providers/materials'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import { MATERIAL_CATALOG } from '../../shared/types/market'
import { MockMaterialPriceProvider } from '../providers/materials/MockMaterialPriceProvider'

const app = new Hono<AppEnv>()

// GET /api/material-prices?keys=rebar,cement
app.get('/', async (c) => {
  const keysParam = c.req.query('keys')
  const allowed = new Set(MATERIAL_CATALOG.map((m) => m.key))
  const requestedKeys = (keysParam ? keysParam.split(',') : MATERIAL_CATALOG.slice(0, 6).map((m) => m.key))
    .filter((key) => allowed.has(key))
    .slice(0, 6)
  const keys = requestedKeys.length ? requestedKeys : MATERIAL_CATALOG.slice(0, 6).map((m) => m.key)

  const provider = await getMaterialPriceProvider(c.env)
  const cacheKey = `material:${provider.source}:${keys.join(',')}`
  try {
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.material, () => provider.getPrices(keys))
    const message = provider.source === 'mock'
      ? '조달청 가격정보현황서비스 미승인 또는 응답 실패로 참고용 Mock 데이터를 표시합니다.'
      : '조달청 나라장터 가격정보현황서비스의 공공 기준가격입니다.'
    const envelope = ok(value, provider.source, message)
    envelope.cached = cached
    return c.json(envelope)
  } catch {
    const stale = cacheGetStale<any[]>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: provider.source, cached: true, stale: true, message: '이전 자재가격 데이터를 표시합니다.' })
    }
    if (provider.source === 'live') {
      const mock = new MockMaterialPriceProvider()
      return c.json(ok(await mock.getPrices(keys), 'mock', '조달청 가격정보현황서비스 미승인 또는 응답 실패로 참고용 Mock 데이터를 표시합니다.'))
    }
    return c.json(fail('자재가격 정보를 불러올 수 없습니다', 'mock'), 502)
  }
})

export default app
