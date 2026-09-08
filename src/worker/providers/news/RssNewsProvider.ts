import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'

interface RssFeedConfig {
  url: string
  source: string
  category: NewsCategory
}

const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'
const GDELT_QUERY = '(construction OR infrastructure OR "industrial accident" OR "real estate") sourcelang:korean'

const FEEDS: RssFeedConfig[] = [
  { url: 'https://www.molit.go.kr/dev/board/board_rss.jsp?rss_id=NEWS', source: '국토교통부', category: '건설정책' },
  { url: 'https://www.molit.go.kr/dev/board/board_rss.jsp?rss_id=N01_B', source: '국토교통부', category: '건설정책' },
  { url: 'https://www.moel.go.kr/rss/policy.do', source: '고용노동부', category: '건설안전' },
  { url: 'https://www.moel.go.kr/rss/notice.do', source: '고용노동부', category: '건설안전' },
  { url: 'https://www.moel.go.kr/rss/lawinfo.do', source: '고용노동부', category: '건설정책' },
]

const CATEGORY_RULES: [NewsCategory, RegExp][] = [
  ['중대재해', /중대재해|사망사고|산업재해|재해사례|중대재해사이렌/],
  ['건설안전', /안전|사고|재해|산재|붕괴|점검/],
  ['SOC', /SOC|사회간접자본|철도|도로|항만|공항/],
  ['건설사', /건설사|시공사|종합건설/],
  ['수주', /수주|낙찰|입찰|계약/],
  ['부동산', /부동산|주택|아파트|분양/],
  ['스마트건설', /스마트건설|BIM|디지털트윈|로봇/],
  ['AI/AX', /\bAI\b|인공지능|AX|자동화/],
  ['해외건설', /해외건설|해외수주|글로벌|국제/],
  ['건설정책', /건설|국토|정책|법령/],
]

function categoryFor(title: string, fallback: NewsCategory): NewsCategory {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(title))?.[0] ?? fallback
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
  return match ? match[1].trim() : ''
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

function toIsoDate(value: string): string {
  const gdelt = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (gdelt) return `${gdelt[1]}-${gdelt[2]}-${gdelt[3]}T${gdelt[4]}:${gdelt[5]}:${gdelt[6]}.000Z`
  const moel = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
  const date = new Date(moel ? `${moel[1]}T${moel[2]}+09:00` : value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function item(params: Omit<NewsItem, 'id' | 'isNew'>): NewsItem {
  return {
    ...params,
    id: `${params.source}-${params.publishedAt}-${params.url}`,
    isNew: Date.now() - Date.parse(params.publishedAt) < 6 * 3600000,
  }
}

function safeArticleUrl(value: string): string | null {
  try {
    const url = new URL(decodeEntities(value))
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function parseRssItems(xml: string, source: string, fallbackCategory: NewsCategory): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap((match) => {
    const title = decodeEntities(extractTag(match[1], 'title'))
    const url = safeArticleUrl(extractTag(match[1], 'link'))
    if (!title || !url) return []
    const publishedAt = toIsoDate(extractTag(match[1], 'dc:date') || extractTag(match[1], 'pubDate'))
    return [item({
      title,
      source,
      publishedAt,
      category: categoryFor(title, fallbackCategory),
      url,
    })]
  })
}

interface GdeltArticle {
  title?: unknown
  domain?: unknown
  seendate?: unknown
  url?: unknown
}

function parseGdelt(data: unknown, fallbackCategory: NewsCategory): NewsItem[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { articles?: unknown }).articles)) return []
  return (data as { articles: GdeltArticle[] }).articles.flatMap((article) => {
    if (typeof article.title !== 'string' || typeof article.url !== 'string') return []
    const url = safeArticleUrl(article.url)
    if (!url) return []
    const title = decodeEntities(article.title)
    const publishedAt = toIsoDate(typeof article.seendate === 'string' ? article.seendate : '')
    return [item({
      title,
      source: typeof article.domain === 'string' && article.domain ? article.domain : 'GDELT',
      publishedAt,
      category: categoryFor(title, fallbackCategory),
      url,
    })]
  })
}

export class RssNewsProvider implements NewsProvider {
  readonly source = 'live' as const

  async getNews(categories: NewsCategory[], limit = 10): Promise<NewsItem[]> {
    const fallbackCategory = categories[0] ?? '건설정책'
    const gdeltUrl = new URL(GDELT_URL)
    gdeltUrl.search = new URLSearchParams({
      query: GDELT_QUERY,
      mode: 'artlist',
      maxrecords: String(Math.max(20, Math.min(100, limit * 4))),
      timespan: '7d',
      format: 'json',
      sort: 'datedesc',
    }).toString()

    const results = await Promise.allSettled([
      fetch(gdeltUrl, { headers: { 'User-Agent': 'ConstructionDashboard/1.0' } }).then(async (response) => {
        if (!response.ok) throw new Error(`GDELT fetch failed (${response.status})`)
        return parseGdelt(await response.json(), fallbackCategory)
      }),
      ...FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, { headers: { 'User-Agent': 'ConstructionDashboard/1.0' } })
        if (!response.ok) throw new Error(`RSS fetch failed: ${feed.url} (${response.status})`)
        return parseRssItems(await response.text(), feed.source, feed.category)
      }),
    ])

    const seen = new Set<string>()
    const news = results
      .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .filter((newsItem) => categories.length === 0 || categories.includes(newsItem.category))
      .filter((newsItem) => {
        const key = newsItem.title.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, limit)

    if (results.every((result) => result.status === 'rejected')) throw new Error('무료 뉴스 소스 조회에 실패했습니다')
    return news
  }
}
