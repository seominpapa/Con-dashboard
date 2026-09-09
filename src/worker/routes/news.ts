import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getNewsProvider } from '../providers/news'
import { NewsSourcesUnavailableError } from '../providers/news/RssNewsProvider'
import { CACHE_TTL } from '../cache/memoryCache'
import { withWidgetSnapshot } from '../cache/widgetSnapshot'
import { fail } from '../../shared/types/common'
import type { NewsCategory, NewsItem } from '../../shared/types/news'

const app = new Hono<AppEnv>()
const CATEGORIES: NewsCategory[] = ['건설정책', 'SOC', '건설안전', '중대재해', '건설사', '수주', '부동산', '스마트건설', 'AI/AX', '해외건설']

function usableNews(value: NewsItem[]): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every((entry) =>
    entry && typeof entry.title === 'string' && entry.title.trim().length > 0 &&
    typeof entry.url === 'string' && /^https?:\/\//.test(entry.url) &&
    typeof entry.publishedAt === 'string' && Number.isFinite(Date.parse(entry.publishedAt)))
}

// GET /api/news?categories=건설정책,SOC&limit=10
app.get('/', async (c) => {
  const categoriesParam = c.req.query('categories')
  const categories = [...new Set(categoriesParam ? categoriesParam.split(',') : [])].sort() as NewsCategory[]
  const limit = Number(c.req.query('limit') ?? 10)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || categories.some((category) => !CATEGORIES.includes(category))) {
    return c.json(fail('뉴스 카테고리 또는 조회 개수(1~50)를 확인해 주세요'), 400)
  }

  try {
    const provider = await getNewsProvider(c.env)
    const envelope = await withWidgetSnapshot(c.env.DB, `widget:news:${categories.join(',')}`, 'v1', CACHE_TTL.news, 24 * 60 * 60 * 1000,
      () => provider.getNews(categories, 50), usableNews)
    return c.json({ ...envelope, data: envelope.data?.slice(0, limit) ?? null })
  } catch (error) {
    const message = error instanceof NewsSourcesUnavailableError ? error.message : '뉴스를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.'
    return c.json(fail(message, 'live'), 502)
  }
})

export default app
