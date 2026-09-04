import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getWeatherProvider } from '../providers/weather'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { Site } from '../../shared/types/site'
import { evaluateConstructionWeatherRisk, WEATHER_RISK_DISCLAIMER } from '../../shared/utils/constructionWeatherRisk'

const app = new Hono<AppEnv>()

function siteFromQuery(c: any): Site | null {
  const id = c.req.query('siteId')
  const name = c.req.query('siteName')
  const address = c.req.query('address')
  const nx = c.req.query('nx')
  const ny = c.req.query('ny')
  const lat = c.req.query('lat')
  const lon = c.req.query('lon')
  if (!id || !nx || !ny) return null
  return {
    id,
    name: name ?? id,
    company: '',
    address: address ?? '',
    latitude: Number(lat ?? 0),
    longitude: Number(lon ?? 0),
    kmaNx: Number(nx),
    kmaNy: Number(ny),
    startDate: '',
    endDate: '',
    status: 'active',
  }
}

// GET /api/weather?siteId=..&siteName=..&address=..&nx=..&ny=..
app.get('/', async (c) => {
  const site = siteFromQuery(c)
  if (!site) return c.json(fail('필수 파라미터(siteId, nx, ny)가 누락되었습니다', 'live'), 400)

  const cacheKey = `weather:${site.id}:${site.kmaNx}:${site.kmaNy}`
  try {
    const provider = getWeatherProvider(c.env)
    const { value: weather, cached } = await withCache(cacheKey, CACHE_TTL.weather, () => provider.getCurrentWeather(site))
    const risk = evaluateConstructionWeatherRisk(weather)
    const envelope = ok({ weather, risk: { items: risk, disclaimer: WEATHER_RISK_DISCLAIMER } }, provider.source)
    envelope.cached = cached
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
        message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})`,
      })
    }
    return c.json(fail(`날씨 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

// GET /api/weather/alerts?siteId=..&nx=..&ny=..&address=..
app.get('/alerts', async (c) => {
  const site = siteFromQuery(c)
  if (!site) return c.json(fail('필수 파라미터가 누락되었습니다', 'live'), 400)

  const cacheKey = `weather-alert:${site.id}:${site.address}`
  try {
    const provider = getWeatherProvider(c.env)
    const { value: alerts, cached } = await withCache(cacheKey, CACHE_TTL.weatherAlert, () => provider.getAlerts(site))
    const envelope = ok(alerts, provider.source)
    envelope.cached = cached
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
        message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})`,
      })
    }
    return c.json(fail(`특보 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
