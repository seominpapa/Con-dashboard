import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getBidProvider } from '../providers/bidding'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'

const app = new Hono<AppEnv>()

// GET /api/bids?keyword=..&region=..&workType=..&limit=..
app.get('/', async (c) => {
  const keyword = c.req.query('keyword') ?? ''
  const region = c.req.query('region') ?? ''
  const workType = c.req.query('workType') ?? ''
  const limit = Number(c.req.query('limit') ?? 20)

  const cacheKey = `bidding:${keyword}:${region}:${workType}:${limit}`
  try {
    const provider = await getBidProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.bidding, () =>
      provider.searchBids({ keyword: keyword || undefined, regions: region ? [region] : undefined, workTypes: workType ? [workType] : undefined }, limit)
    )
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`입찰 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
