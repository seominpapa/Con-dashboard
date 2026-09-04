import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getSiteSummaryProvider } from '../providers/site-summary'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { Site } from '../../shared/types/site'

const app = new Hono<AppEnv>()

function siteFromQuery(c: any): Site | null {
  const id = c.req.query('siteId')
  const name = c.req.query('siteName')
  if (!id) return null
  return {
    id,
    name: name ?? id,
    company: '',
    address: '',
    latitude: 0,
    longitude: 0,
    kmaNx: 0,
    kmaNy: 0,
    startDate: '',
    endDate: '',
    status: 'active',
  }
}

// GET /api/site-summary?siteId=..&siteName=..
app.get('/', async (c) => {
  const site = siteFromQuery(c)
  if (!site) return c.json(fail('필수 파라미터(siteId)가 누락되었습니다', 'mock'), 400)

  const cacheKey = `site-summary:${site.id}`
  try {
    const provider = await getSiteSummaryProvider(c.env)
    const { value, cached } = await withCache(cacheKey, 5 * 60 * 1000, () => provider.getTodaySummary(site))
    const envelope = ok(value, 'mock' as const)
    envelope.cached = cached
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'mock', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`현장 요약 정보를 불러올 수 없습니다: ${err.message}`, 'mock'), 502)
  }
})

export default app
