import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getLawProvider } from '../providers/laws'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import { RECOMMENDED_LAWS } from '../../shared/types/law'

const app = new Hono<AppEnv>()

// GET /api/laws?names=법1,법2 (미지정 시 추천 목록 사용)
app.get('/', async (c) => {
  const namesParam = c.req.query('names')
  const names = namesParam ? namesParam.split(',') : [...RECOMMENDED_LAWS]

  const cacheKey = `laws:${names.join(',')}`
  try {
    const provider = await getLawProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.law, () => provider.getLaws(names))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`법령 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
