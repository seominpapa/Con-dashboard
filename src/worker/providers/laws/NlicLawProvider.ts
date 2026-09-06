import type { LawProvider } from './LawProvider'
import type { LawItem } from '../../../shared/types/law'

/** 법제처 국가법령정보 Open API (law.go.kr) */
const SEARCH_URL = 'https://www.law.go.kr/DRF/lawSearch.do'

export class NlicLawProvider implements LawProvider {
  readonly source = 'live' as const
  constructor(private apiKey: string) {}

  async getLaws(lawNames: string[]): Promise<LawItem[]> {
    const results = await Promise.allSettled(
      lawNames.map(async (name) => {
        const url = new URL(SEARCH_URL)
        url.searchParams.set('OC', this.apiKey)
        url.searchParams.set('target', 'law')
        url.searchParams.set('type', 'JSON')
        url.searchParams.set('query', name)
        url.searchParams.set('display', '1')

        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`법제처 API 오류: ${res.status}`)
        const json: any = await res.json()
        const law = json?.LawSearch?.law?.[0]
        if (!law) throw new Error(`법령 조회 결과 없음: ${name}`)

        const lastAmended = law['시행일자'] ?? law['공포일자'] ?? ''
        const effective = law['시행일자'] ?? ''
        return {
          id: law['법령일련번호'] ?? name,
          name: law['법령명한글'] ?? name,
          lastAmendedDate: formatDate(law['공포일자']),
          effectiveDate: formatDate(law['시행일자']),
          changed: isRecentlyChanged(law['공포일자']),
          url: law['법령상세링크'] ? `https://www.law.go.kr${law['법령상세링크']}` : undefined,
        } as LawItem
      })
    )
    if (results.every((result) => result.status === 'rejected')) {
      throw new Error('법제처 API에서 법령을 조회하지 못했습니다')
    }
    const items = results.map((r, idx) => (r.status === 'fulfilled' ? r.value : failItem(lawNames[idx])))
    return items
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
