import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getAirQualityProvider } from '../providers/air-quality'
import { SiteRepository } from '../repositories/SiteRepository'
import { CACHE_TTL } from '../cache/memoryCache'
import { withWidgetSnapshot } from '../cache/widgetSnapshot'
import { ok, fail } from '../../shared/types/common'
import type { Site } from '../../shared/types/site'
import type { AirQualityNow } from '../../shared/types/air-quality'

const app = new Hono<AppEnv>()

function isUsableObservation(value: AirQualityNow): boolean {
  if (!value || typeof value.measuredAt !== 'string' || typeof value.stationName !== 'string' || !value.stationName.trim()) return false
  const age = Date.now() - Date.parse(`${value.measuredAt.replace(' ', 'T')}+09:00`)
  const grades = ['good', 'moderate', 'bad', 'very-bad']
  return Number.isFinite(age) && age >= -10 * 60 * 1000 && age <= 3 * 60 * 60 * 1000
    && [value.pm10, value.pm25, value.o3, value.chai].every((number) => typeof number === 'number' && Number.isFinite(number) && number >= 0)
    && [value.pm10Grade, value.pm25Grade, value.o3Grade, value.chaiGrade].every((grade) => grades.includes(grade))
}

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

  const cacheKey = `widget:air-quality:${c.get('currentUser')!.id}:${site.id}`
  const scope = JSON.stringify([site.id, site.latitude, site.longitude, site.address, site.airkoreaStationName ?? ''])
  try {
    const provider = await getAirQualityProvider(c.env)
    if (provider.source !== 'live') return c.json(ok(await provider.getCurrentAirQuality(site), provider.source))
    const envelope = await withWidgetSnapshot(c.env.DB, cacheKey, scope, CACHE_TTL.airQuality,
      2 * 60 * 60 * 1000, () => provider.getCurrentAirQuality(site), isUsableObservation)
    return c.json({ ...envelope, asOf: envelope.data ? `${envelope.data.measuredAt.replace(' ', 'T')}:00+09:00` : undefined })
  } catch (err: any) {
    return c.json(fail(`대기질 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
