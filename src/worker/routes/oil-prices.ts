import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getOilPriceProvider } from '../providers/oil'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { OilKind } from '../../shared/types/market'

const app = new Hono<AppEnv>()

// GET /api/oil-prices?kinds=dubai,domestic-diesel
app.get('/', async (c) => {
  const kindsParam = c.req.query('kinds')
  const kinds = (kindsParam ? kindsParam.split(',') : ['dubai', 'wti', 'domestic-diesel', 'domestic-gasoline']) as OilKind[]

  const cacheKey = `oil:${kinds.join(',')}`
  try {
    const provider = await getOilPriceProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.oil, () => provider.getPrices(kinds))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`유가 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
