import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getMaterialPriceProvider } from '../providers/materials'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import { MATERIAL_CATALOG } from '../../shared/types/market'

const app = new Hono<AppEnv>()

// GET /api/material-prices?keys=rebar,cement (Mock 전용, 기획 17번)
app.get('/', async (c) => {
  const keysParam = c.req.query('keys')
  const keys = keysParam ? keysParam.split(',') : MATERIAL_CATALOG.slice(0, 6).map((m) => m.key)

  const cacheKey = `material:${keys.join(',')}`
  try {
    const provider = await getMaterialPriceProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.material, () => provider.getPrices(keys))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    envelope.message = envelope.message ?? '자재가격은 공식 상업용 API 확보 전까지 Mock 데이터로 제공됩니다.'
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'mock', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`자재가격 정보를 불러올 수 없습니다: ${err.message}`, 'mock'), 502)
  }
})

export default app
