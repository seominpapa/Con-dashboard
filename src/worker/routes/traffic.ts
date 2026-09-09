import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { getTrafficProvider } from '../providers/traffic'
import { SiteRepository } from '../repositories/SiteRepository'
import { fail, ok } from '../../shared/types/common'
import { canUseStaleTraffic, type NearbyTrafficSnapshot } from '../../shared/types/traffic'
import { SettingsRepository } from '../repositories/SettingsRepository'

const app = new Hono<AppEnv>()

app.get('/', async (c) => {
  const siteId = c.req.query('siteId')
  if (!siteId) return c.json(fail('현장을 선택해 주세요', 'live'), 400)
  const user = c.get('currentUser')!
  const site = await new SiteRepository(c.env.DB).findById(user.id, siteId)
  if (!site) return c.json(fail('현장을 찾을 수 없습니다', 'live'), 404)
  if (!await new SettingsRepository(c.env.DB).consumeFixedWindow(`traffic_rate:${user.id}`, 60, 60)) {
    c.header('Retry-After', '60')
    return c.json(fail('교통정보 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', 'live'), 429)
  }

  const cacheKey = `traffic:${site.id}:${site.latitude.toFixed(5)}:${site.longitude.toFixed(5)}`
  const stale = cacheGetStale<NearbyTrafficSnapshot>(cacheKey)
  try {
    const provider = await getTrafficProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.traffic, () => provider.getNearbyTraffic(site))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    envelope.asOf = value.observedAt
    return c.json(envelope)
  } catch (error: any) {
    if (stale && canUseStaleTraffic(stale.value)) {
      return c.json({ ...ok(stale.value, 'live', '갱신에 실패해 이전 교통정보를 표시합니다'), cached: true, stale: true, asOf: stale.value.observedAt })
    }
    return c.json(fail(`교통정보를 불러올 수 없습니다: ${error?.message ?? '알 수 없는 오류'}`, 'live'), 502)
  }
})

export default app
