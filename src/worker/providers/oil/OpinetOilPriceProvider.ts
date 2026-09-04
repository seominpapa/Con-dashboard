import type { OilPriceProvider } from './OilPriceProvider'
import type { OilPriceItem, OilKind, TrendDirection } from '../../../shared/types/market'
import { OIL_KIND_LABEL } from '../../../shared/types/market'

/** 한국석유공사 Opinet API (국내 유가) */
const OPINET_BASE = 'http://www.opinet.co.kr/api'

// Opinet 국내 평균가 (경유=D047, 휘발유=B027)
const OPINET_PRODCD: Record<string, string> = {
  'domestic-diesel': 'D047',
  'domestic-gasoline': 'B027',
}

export class OpinetOilPriceProvider implements OilPriceProvider {
  readonly source = 'live' as const
  constructor(private apiKey: string) {}

  private async fetchDomestic(kind: 'domestic-diesel' | 'domestic-gasoline'): Promise<OilPriceItem> {
    const url = new URL(`${OPINET_BASE}/avgAllPrice.do`)
    url.searchParams.set('code', this.apiKey)
    url.searchParams.set('out', 'json')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Opinet API error: ${res.status}`)
    const json: any = await res.json()
    const rows: any[] = json?.RESULT?.OIL ?? []
    const prodCode = OPINET_PRODCD[kind]
    const row = rows.find((r) => r.PRODCD === prodCode)
    if (!row) throw new Error(`Opinet: ${kind} 데이터 없음`)

    const price = Number(row.PRICE)
    const diff = Number(row.DIFF ?? 0)
    const direction: TrendDirection = diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'flat'

    return {
      kind,
      label: OIL_KIND_LABEL[kind],
      unit: 'L',
      currency: 'KRW',
      price,
      changeValue: diff,
      weeklyChangeRate: 0,
      monthlyChangeRate: 0,
      direction,
      trend: [],
    }
  }

  async getPrices(kinds: OilKind[]): Promise<OilPriceItem[]> {
    const domesticKinds = kinds.filter(
      (k): k is 'domestic-diesel' | 'domestic-gasoline' => k === 'domestic-diesel' || k === 'domestic-gasoline'
    )
    if (domesticKinds.length === 0) {
      throw new Error('Opinet Provider는 국내 유가(경유/휘발유)만 지원합니다. 국제유가는 다른 Provider가 필요합니다.')
    }
    const results = await Promise.allSettled(domesticKinds.map((k) => this.fetchDomestic(k)))
    const items = results.filter((r): r is PromiseFulfilledResult<OilPriceItem> => r.status === 'fulfilled').map((r) => r.value)
    if (items.length === 0) throw new Error('Opinet: 모든 조회 실패')
    return items
  }
}
