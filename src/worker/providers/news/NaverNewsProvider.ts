import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'

/**
 * Naver News Search API 기반 뉴스 Provider (기획 13번 우선순위 3, 선택적)
 * 공식 RSS로 커버가 안 되는 카테고리(수주/부동산/스마트건설 등)를 보완한다.
 */
const CATEGORY_KEYWORD: Record<NewsCategory, string> = {
  건설정책: '건설정책',
  SOC: 'SOC 건설',
  건설안전: '건설안전',
  건설사: '건설사',
  수주: '건설 수주',
  부동산: '부동산 건설',
  스마트건설: '스마트건설',
  'AI/AX': '건설 AI',
  해외건설: '해외건설',
}

const API_HUB_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news'
const LEGACY_URL = 'https://openapi.naver.com/v1/search/news.json'

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

export class NaverNewsProvider implements NewsProvider {
  readonly source = 'live' as const
  constructor(private clientId: string, private clientSecret: string, private apiType: 'apiHub' | 'legacy' = 'legacy') {}

  async getNews(categories: NewsCategory[], limit = 10): Promise<NewsItem[]> {
    const cats = categories.length ? categories : (Object.keys(CATEGORY_KEYWORD) as NewsCategory[])
    const perCat = Math.max(2, Math.ceil(limit / cats.length))

    const results = await Promise.allSettled(
      cats.map(async (cat) => {
        const url = new URL(this.apiType === 'apiHub' ? API_HUB_URL : LEGACY_URL)
        url.searchParams.set('query', CATEGORY_KEYWORD[cat])
        url.searchParams.set('display', String(perCat))
        url.searchParams.set('sort', 'date')

        const headers: Record<string, string> = this.apiType === 'apiHub'
          ? { 'X-NCP-APIGW-API-KEY-ID': this.clientId, 'X-NCP-APIGW-API-KEY': this.clientSecret }
          : { 'X-Naver-Client-Id': this.clientId, 'X-Naver-Client-Secret': this.clientSecret }
        const res = await fetch(url.toString(), { headers })
        if (!res.ok) throw new Error(`Naver News API error: ${res.status}`)
        const json: any = await res.json()
        const items: NewsItem[] = (json.items ?? []).map((item: any, idx: number) => ({
          id: `naver-${cat}-${idx}-${item.pubDate}`,
          title: stripHtml(item.title),
          source: '네이버뉴스',
          publishedAt: new Date(item.pubDate).toISOString(),
          category: cat,
          url: item.originallink || item.link,
          isNew: Date.now() - new Date(item.pubDate).getTime() < 6 * 3600000,
        }))
        return items
      })
    )

    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (items.length === 0) throw new Error('Naver News API 조회 결과가 없습니다')

    return items
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit)
  }
}
