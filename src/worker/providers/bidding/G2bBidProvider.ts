import type { BidProvider } from './BidProvider'
import type { BidNotice, BidFilter } from '../../../shared/types/bidding'

// 조달청 나라장터 공사입찰공고 목록 (공사입찰정보서비스)
const BASE_URL = 'http://apis.data.go.kr/1230000/ad/BidPublicInfoService'

export class G2bBidProvider implements BidProvider {
  readonly source = 'live' as const
  constructor(private serviceKey: string) {}

  async searchBids(filter: Partial<BidFilter>, limit = 5): Promise<BidNotice[]> {
    const now = new Date()
    const from = new Date(now.getTime() - 14 * 86400000)
    const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}0000`

    const url = new URL(`${BASE_URL}/getBidPblancListInfoCnstwkPPSSrch`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('numOfRows', String(Math.max(limit * 3, 30)))
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('inqryDiv', '1')
    url.searchParams.set('type', 'json')
    url.searchParams.set('inqryBgnDt', fmt(from))
    url.searchParams.set('inqryEndDt', fmt(now))
    if (filter.keyword) url.searchParams.set('bidNtceNm', filter.keyword)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`G2B API error: ${res.status}`)
    const json: any = await res.json()
    const items = json?.response?.body?.items ?? []

    let results: BidNotice[] = items.map((item: any, idx: number) => ({
      id: item.bidNtceNo ?? `g2b-${idx}`,
      title: item.bidNtceNm ?? '',
      organization: item.ntceInsttNm ?? item.dminsttNm ?? '',
      estimatedAmount: Number(item.presmptPrce ?? item.asignBdgtAmt ?? 0),
      announcedDate: parseG2bDate(item.bidNtceDt),
      deadlineDate: parseG2bDate(item.bidClseDt),
      region: item.rgnNm ?? item.prtcptLmtRgnNm ?? '전국',
      workType: item.bidNtceSttusNm ?? '공사',
      url: item.bidNtceUrl ?? undefined,
    }))

    // Client-side 추가 필터링 (지역/공종/금액)
    if (filter.regions?.length) {
      results = results.filter((r) => filter.regions!.some((rg) => r.region.includes(rg)))
    }
    if (filter.minAmount) {
      results = results.filter((r) => r.estimatedAmount >= filter.minAmount! * 100_000_000)
    }
    if (filter.maxAmount) {
      results = results.filter((r) => r.estimatedAmount <= filter.maxAmount! * 100_000_000)
    }

    return results.slice(0, limit)
  }
}

function parseG2bDate(raw?: string): string {
  if (!raw) return new Date().toISOString()
  // G2B format: "2026-09-04 10:00:00"
  return new Date(raw.replace(' ', 'T')).toISOString()
}
