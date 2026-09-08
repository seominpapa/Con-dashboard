import type { LawProvider } from './LawProvider'
import type { LawItem } from '../../../shared/types/law'
import { LAW_SEARCH_MAX_LENGTH, LAW_SEARCH_MAX_RESULTS, LAW_SEARCH_MIN_LENGTH } from '../../../shared/types/law.ts'

/** 법제처 국가법령정보 Open API (law.go.kr) */
const SEARCH_URL = 'https://www.law.go.kr/DRF/lawSearch.do'

export class NlicLawProvider implements LawProvider {
  readonly source = 'live' as const
  private oc: string

  constructor(oc: string) {
    this.oc = oc
  }

  async getLaws(lawNames: string[]): Promise<LawItem[]> {
    const results = await Promise.allSettled(
      lawNames.map(async (name) => {
        const [law] = await this.searchLaws(name, 1)
        if (!law) throw new Error(`법령 조회 결과 없음: ${name}`)
        return law
      })
    )
    if (results.every((result) => result.status === 'rejected')) {
      throw new Error('법제처 API에서 법령을 조회하지 못했습니다')
    }
    const items = results.map((r, idx) => (r.status === 'fulfilled' ? r.value : failItem(lawNames[idx])))
    return items
  }

  async searchLaws(query: string, limit = 10): Promise<LawItem[]> {
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < LAW_SEARCH_MIN_LENGTH || normalizedQuery.length > LAW_SEARCH_MAX_LENGTH) {
      throw new Error(`법령 검색어는 ${LAW_SEARCH_MIN_LENGTH}~${LAW_SEARCH_MAX_LENGTH}자로 입력해 주세요`)
    }

    const url = new URL(SEARCH_URL)
    url.searchParams.set('OC', this.oc)
    url.searchParams.set('target', 'eflaw')
    url.searchParams.set('type', 'JSON')
    url.searchParams.set('query', normalizedQuery)
    url.searchParams.set('search', '1')
    url.searchParams.set('nw', '3')
    url.searchParams.set('display', String(Math.min(LAW_SEARCH_MAX_RESULTS, Math.max(1, Math.floor(limit)))))

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`법제처 API 오류: ${res.status}`)
    const json: any = await res.json()
    const raw = json?.LawSearch?.law
    const laws = raw ? (Array.isArray(raw) ? raw : [raw]) : []
    return laws.map((law: any) => toLawItem(law, normalizedQuery))
  }
}

function toLawItem(law: any, fallbackName: string): LawItem {
  const name = law['법령명한글'] ?? fallbackName
  return {
    id: String(law['법령일련번호'] ?? law['법령ID'] ?? name),
    name,
    lastAmendedDate: formatDate(law['공포일자']),
    effectiveDate: formatDate(law['시행일자']),
    changed: isRecentlyChanged(law['공포일자']),
    url: officialDetailUrl(law['법령상세링크'], name),
  }
}

function officialDetailUrl(raw: unknown, lawName: string): string {
  const fallback = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  try {
    const url = new URL(raw, 'https://www.law.go.kr')
    if (!['law.go.kr', 'www.law.go.kr'].includes(url.hostname)) return fallback
    if (url.pathname.startsWith('/DRF/')) return fallback
    url.protocol = 'https:'
    url.hostname = 'www.law.go.kr'
    url.searchParams.delete('OC')
    url.searchParams.delete('oc')
    return url.toString()
  } catch {
    return fallback
  }
}

function formatDate(raw?: string): string {
  if (!raw || raw.length !== 8) return ''
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function isRecentlyChanged(raw?: string): boolean {
  if (!raw || raw.length !== 8) return false
  const date = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`)
  return Date.now() - date.getTime() < 90 * 86400000
}

function failItem(name: string): LawItem {
  return {
    id: `error-${name}`,
    name,
    lastAmendedDate: '',
    effectiveDate: '',
    changed: false,
  }
}
