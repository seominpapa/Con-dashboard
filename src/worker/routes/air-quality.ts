import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getAirQualityProvider } from '../providers/air-quality'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { Site } from '../../shared/types/site'

const app = new Hono<AppEnv>()

function siteFromQuery(c: any): Site | null {
  const id = c.req.query('siteId')
  const name = c.req.query('siteName')
  const address = c.req.query('address')
  const station = c.req.query('station')
  if (!id) return null
  return {
    id,
    name: name ?? id,
    company: '',
    address: address ?? '',
    latitude: 0,
    longitude: 0,
    kmaNx: 0,
    kmaNy: 0,
    startDate: '',
    endDate: '',
    status: 'active',
    airkoreaStationName: station ?? undefined,
  }
}

// GET /api/air-quality?siteId=..&siteName=..&station=..
app.get('/', async (c) => {
  const site = siteFromQuery(c)
  if (!site) return c.json(fail('필수 파라미터(siteId)가 누락되었습니다', 'live'), 400)

  const cacheKey = `air-quality:${site.id}:${site.airkoreaStationName ?? ''}`
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
