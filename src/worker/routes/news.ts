import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getNewsProvider } from '../providers/news'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import type { NewsCategory } from '../../shared/types/news'

const app = new Hono<AppEnv>()

// GET /api/news?categories=건설정책,SOC&limit=10
app.get('/', async (c) => {
  const categoriesParam = c.req.query('categories')
  const categories = (categoriesParam ? categoriesParam.split(',') : []) as NewsCategory[]
  const limit = Number(c.req.query('limit') ?? 10)

  const cacheKey = `news:${categories.join(',')}:${limit}`
  try {
    const provider = await getNewsProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.news, () => provider.getNews(categories, limit))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`뉴스를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
