import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getAirQualityProvider } from '../providers/air-quality'
import { SiteRepository } from '../repositories/SiteRepository'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { Site } from '../../shared/types/site'

const app = new Hono<AppEnv>()

async function getSite(c: any): Promise<Site | null> {
  const user = c.get('currentUser')!
  const siteId = c.req.query('siteId')
  if (!siteId) return null
  return new SiteRepository(c.env.DB).findById(user.id, siteId)
}

// GET /api/air-quality?siteId=..
app.get('/', async (c) => {
  const site = await getSite(c)
  if (!site) return c.json(fail('현장을 찾을 수 없습니다', 'live'), 404)

  const cacheKey = `air-quality:${site.id}:${site.latitude}:${site.longitude}:${site.address}:${site.airkoreaStationName ?? ''}`
  try {
    const provider = await getAirQualityProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.airQuality, () => provider.getCurrentAirQuality(site))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`대기질 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
