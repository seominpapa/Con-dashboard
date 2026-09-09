import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'

interface NewsFeed {
  id: string
  query: string
  category: NewsCategory
}

// 정부 RSS·GDELT는 Cloudflare에서 차단·시간초과되어 Google 뉴스 RSS 검색으로 대체한다.
const FEEDS: NewsFeed[] = [
  { id: 'POLICY', query: '건설 정책 OR 국토교통부 건설 OR 건설산업', category: '건설정책' },
  { id: 'SAFETY', query: '건설현장 사고 OR 건설 중대재해 OR 건설현장 안전', category: '건설안전' },
  { id: 'ORDER', query: '건설사 수주 OR 건설 입찰 OR 시공사 선정', category: '수주' },
  { id: 'ESTATE', query: '아파트 분양 OR 주택 공급 OR 부동산 시장', category: '부동산' },
  { id: 'TECH', query: '스마트건설 OR 건설 AI OR 해외건설 수주 OR SOC 사업', category: '스마트건설' },
]

function feedUrl(feed: NewsFeed): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${feed.query} when:7d`)}&hl=ko&gl=KR&ceid=KR:ko`
}

type NewsFailureCode = `HTTP_${number}` | 'TIMEOUT' | 'FORMAT' | 'NETWORK'
  | 'FORMAT_EMPTY' | 'FORMAT_HTML' | 'FORMAT_RSS' | 'FORMAT_OTHER'
class NewsSourceFailure extends Error {
  readonly code: NewsFailureCode
  constructor(code: NewsFailureCode) { super(code); this.code = code }
}

export class NewsSourcesUnavailableError extends Error {
  constructor(results: PromiseSettledResult<NewsItem[]>[]) {
    const details = FEEDS.map((feed, index) => {
      const result = results[index]
      const error = result?.status === 'rejected' ? result.reason : undefined
      const code = error instanceof NewsSourceFailure ? error.code
        : error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT'
        : error instanceof SyntaxError ? 'FORMAT' : 'NETWORK'
      return `${feed.id}=${code}`
    }).join(', ')
    super(`뉴스 소스 조회에 실패했습니다 [${details}]`)
    this.name = 'NewsSourcesUnavailableError'
  }
}

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
  const date = new Date(value)
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

export function parseRssItems(xml: string, fallbackCategory: NewsCategory): NewsItem[] {
  if (!/<rss\b[^>]*>[\s\S]*<channel\b[^>]*>[\s\S]*<\/channel>\s*<\/rss>\s*$/i.test(xml)) {
    const code = !xml.trim() ? 'FORMAT_EMPTY'
      : /<!doctype\s+html\b|<html\b/i.test(xml) ? 'FORMAT_HTML'
      : /<rss\b/i.test(xml) ? 'FORMAT_RSS' : 'FORMAT_OTHER'
    throw new NewsSourceFailure(code)
  }
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap((match) => {
    const source = decodeEntities(extractTag(match[1], 'source')) || 'Google 뉴스'
    // Google 뉴스 제목은 " - 매체명"으로 끝난다.
    const rawTitle = decodeEntities(extractTag(match[1], 'title'))
    const title = (rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -source.length - 3) : rawTitle).trim()
    const url = safeArticleUrl(extractTag(match[1], 'link'))
    if (!title || !url) return []
    const publishedAt = toIsoDate(extractTag(match[1], 'pubDate') || extractTag(match[1], 'dc:date'))
    return [item({ title, source, publishedAt, category: categoryFor(title, fallbackCategory), url })]
  })
}

export class RssNewsProvider implements NewsProvider {
  readonly source = 'live' as const

  async getNews(categories: NewsCategory[], limit = 10): Promise<NewsItem[]> {
    const results = await Promise.allSettled(FEEDS.map(async (feed) => {
      const response = await fetch(feedUrl(feed), { headers: { 'User-Agent': 'ConstructionDashboard/1.0' }, signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new NewsSourceFailure(`HTTP_${response.status}`)
      return parseRssItems(await response.text(), feed.category)
    }))

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

    if (results.every((result) => result.status === 'rejected')) throw new NewsSourcesUnavailableError(results)
    return news
  }
}
