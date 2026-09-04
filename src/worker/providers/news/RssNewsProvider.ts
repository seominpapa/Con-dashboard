import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'

/**
 * 정부/공공기관 공식 RSS 피드 기반 뉴스 Provider (기획 13번 우선순위 1)
 * - 기사 전문을 저장하지 않고 제목/출처/발행시간/링크만 사용한다.
 */
interface RssFeedConfig {
  url: string
  source: string
  category: NewsCategory
}

const FEEDS: RssFeedConfig[] = [
  { url: 'https://www.molit.go.kr/rss/rss_news.do', source: '국토교통부', category: '건설정책' },
  { url: 'https://www.moel.go.kr/rss/moelRssList.do', source: '고용노동부', category: '건설안전' },
]

function parseRssItems(xml: string, source: string, category: NewsCategory): NewsItem[] {
  const items: NewsItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    const pubDate = extractTag(block, 'pubDate')
    if (!title) continue
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
    items.push({
      id: `rss-${source}-${idx++}-${publishedAt}`,
      title: decodeEntities(title),
      source,
      publishedAt,
      category,
      url: link || '#',
      isNew: Date.now() - new Date(publishedAt).getTime() < 6 * 3600000,
    })
  }
  return items
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
  return m ? m[1].trim() : ''
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export class RssNewsProvider implements NewsProvider {
  readonly source = 'live' as const

  async getNews(categories: NewsCategory[], limit = 10): Promise<NewsItem[]> {
    const targetFeeds = categories.length ? FEEDS.filter((f) => categories.includes(f.category)) : FEEDS
    const feedsToFetch = targetFeeds.length ? targetFeeds : FEEDS

    const results = await Promise.allSettled(
      feedsToFetch.map(async (feed) => {
        const res = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0 ConstructionDashboard/1.0' } })
        if (!res.ok) throw new Error(`RSS fetch failed: ${feed.url} (${res.status})`)
        const xml = await res.text()
        return parseRssItems(xml, feed.source, feed.category)
      })
    )

    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (items.length === 0) {
      throw new Error('모든 공식 RSS 피드 조회에 실패했습니다')
    }

    return items
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit)
  }
}
