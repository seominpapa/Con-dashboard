import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'

interface NewsFeed {
  id: string
  url: string
  source: string
  category: NewsCategory
}

const bing = (query: string) => `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=ko-KR&cc=KR`

// 정부 RSS·GDELT·Google 뉴스는 Cloudflare 서버에서 차단(HTML/503)·시간초과된다. 건설 전문지 RSS와 Bing 뉴스 검색 RSS를 쓴다.
const FEEDS: NewsFeed[] = [
  { id: 'CONSTIMES', url: 'https://www.constimes.co.kr/rss/allArticle.xml', source: '건설타임즈', category: '건설정책' },
  { id: 'KOSCAJ', url: 'https://www.koscaj.com/rss/allArticle.xml', source: '대한전문건설신문', category: '건설정책' },
  { id: 'ANJUNJ', url: 'https://www.anjunj.com/rss/allArticle.xml', source: '안전저널', category: '건설안전' },
  { id: 'SAFETYNEWS', url: 'https://www.safetynews.co.kr/rss/allArticle.xml', source: '안전신문', category: '건설안전' },
  { id: 'BING_ORDER', url: bing('건설사 수주 OR 건설 입찰'), source: 'Bing 뉴스', category: '수주' },
  { id: 'BING_ESTATE', url: bing('아파트 분양 OR 주택 공급'), source: 'Bing 뉴스', category: '부동산' },
  { id: 'BING_TECH', url: bing('스마트건설 OR 해외건설 OR 건설 AI'), source: 'Bing 뉴스', category: '스마트건설' },
]

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
  // 국내 언론사 RSS는 'YYYY-MM-DD HH:mm:ss'(KST)로 준다.
  const kst = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
  const date = new Date(kst ? `${kst[1]}T${kst[2]}+09:00` : value)
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

export function parseRssItems(xml: string, feedSource: string, fallbackCategory: NewsCategory): NewsItem[] {
  if (!/<rss\b[^>]*>[\s\S]*<channel\b[^>]*>[\s\S]*<\/channel>\s*<\/rss>\s*$/i.test(xml)) {
    const code = !xml.trim() ? 'FORMAT_EMPTY'
      : /<!doctype\s+html\b|<html\b/i.test(xml) ? 'FORMAT_HTML'
      : /<rss\b/i.test(xml) ? 'FORMAT_RSS' : 'FORMAT_OTHER'
    throw new NewsSourceFailure(code)
  }
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap((match) => {
    // Bing은 <News:Source>, 검색형 피드는 <source>에 매체명을 담는다. 제목 끝의 " - 매체명"은 제거한다.
    const source = decodeEntities(extractTag(match[1], 'News:Source') || extractTag(match[1], 'source')) || feedSource
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
      const response = await fetch(feed.url, { headers: { 'User-Agent': 'ConstructionDashboard/1.0' }, signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new NewsSourceFailure(`HTTP_${response.status}`)
      return parseRssItems(await response.text(), feed.source, feed.category)
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
