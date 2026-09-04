import type { Bindings } from '../../env'
import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'
import { RssNewsProvider } from './RssNewsProvider'
import { NaverNewsProvider } from './NaverNewsProvider'
import { MockNewsProvider } from './MockNewsProvider'

/**
 * 공식 RSS(우선) + Naver News(선택, 보완) 조합 Provider.
 * 실패 시 다음 우선순위로 자동 fallback한다. 모두 실패하면 상위 라우트에서
 * catch하여 Mock으로 전환한다.
 */
class CompositeNewsProvider implements NewsProvider {
  readonly source = 'live' as const
  constructor(private rss: RssNewsProvider, private naver?: NaverNewsProvider) {}

  async getNews(categories: NewsCategory[], limit = 10): Promise<NewsItem[]> {
    const settled = await Promise.allSettled([
      this.rss.getNews(categories, limit),
      this.naver ? this.naver.getNews(categories, limit) : Promise.reject(new Error('naver not configured')),
    ])
    const items = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (items.length === 0) {
      throw new Error('모든 뉴스 소스 조회 실패')
    }
    // 중복 제거 (제목 기준)
    const seen = new Set<string>()
    const deduped = items.filter((item) => {
      if (seen.has(item.title)) return false
      seen.add(item.title)
      return true
    })
    return deduped
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit)
  }
}

export function getNewsProvider(env: Bindings): NewsProvider {
  const naver = env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET
    ? new NaverNewsProvider(env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET)
    : undefined
  // RSS는 API Key 불필요 -> 항상 시도 가능. Naver는 있으면 보완.
  return new CompositeNewsProvider(new RssNewsProvider(), naver)
}

export function getMockNewsProvider(): NewsProvider {
  return new MockNewsProvider()
}

export * from './NewsProvider'
