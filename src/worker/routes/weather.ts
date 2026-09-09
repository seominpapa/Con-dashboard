import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getWeatherProvider, getWeatherAlertProvider } from '../providers/weather'
import { SiteRepository } from '../repositories/SiteRepository'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { Site } from '../../shared/types/site'
import { evaluateConstructionWeatherRisk, WEATHER_RISK_DISCLAIMER } from '../../shared/utils/constructionWeatherRisk'

const app = new Hono<AppEnv>()

async function getSite(c: any): Promise<Site | null> {
  const user = c.get('currentUser')!
  const siteId = c.req.query('siteId')
  if (!siteId) return null
  return new SiteRepository(c.env.DB).findById(user.id, siteId)
}

// GET /api/weather?siteId=..
app.get('/', async (c) => {
  const site = await getSite(c)
  if (!site) return c.json(fail('현장을 찾을 수 없습니다', 'live'), 404)

  const cacheKey = `weather:${site.id}:${site.kmaNx}:${site.kmaNy}`
  try {
    const provider = await getWeatherProvider(c.env)
    const { value: weather, cached } = await withCache(cacheKey, CACHE_TTL.weather, () => provider.getCurrentWeather(site))
    const risk = evaluateConstructionWeatherRisk(weather)
    const envelope = ok({ weather, risk: { items: risk, disclaimer: WEATHER_RISK_DISCLAIMER } }, provider.source)
    envelope.cached = cached
    envelope.asOf = weather.observedAt
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      const risk = evaluateConstructionWeatherRisk(stale.value)
      return c.json({
        status: 'success',
        data: { weather: stale.value, risk: { items: risk, disclaimer: WEATHER_RISK_DISCLAIMER } },
        updatedAt: new Date().toISOString(),
        source: 'live',
        cached: true,
        asOf: stale.value.observedAt,
        message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})`,
      })
    }
    return c.json(fail(`날씨 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

// GET /api/weather/alerts?siteId=..
app.get('/alerts', async (c) => {
  const site = await getSite(c)
  if (!site) return c.json(fail('현장을 찾을 수 없습니다', 'live'), 404)

  const cacheKey = `weather-alert:${site.id}:${site.address}`
  try {
    const provider = await getWeatherAlertProvider(c.env)
    const { value: alerts, cached } = await withCache(cacheKey, CACHE_TTL.weatherAlert, () => provider.getAlerts(site))
    const envelope = ok(alerts, provider.source)
    envelope.cached = cached
    envelope.asOf = alerts[0]?.announcedAt
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({
        status: 'success',
        data: stale.value,
        updatedAt: new Date().toISOString(),
        source: 'live',
        cached: true,
        asOf: stale.value[0]?.announcedAt,
        message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})`,
      })
    }
    return c.json(fail(`특보 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
