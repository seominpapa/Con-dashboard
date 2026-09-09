import type { MaterialPriceItem } from '../../../shared/types/market'
import { MATERIAL_CATALOG } from '../../../shared/types/market.ts'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials.ts'
import type { MaterialPriceProvider } from './MaterialPriceProvider'

const ENDPOINT = 'https://apis.data.go.kr/1230000/ao/PriceInfoService/getPriceInfoListFcltyCmmnMtrilTotal'
const KEYWORDS: Record<string, string[]> = {
  rebar: ['철근', '이형봉강'],
  'h-beam': ['H형강', '에이치형강'],
  'steel-plate': ['후판'],
  copper: ['동관', '동판', '구리'],
  aluminum: ['알루미늄'],
  cement: ['시멘트'],
  remicon: ['레미콘', 'ready mixed concrete'],
  asphalt: ['아스팔트'],
  aggregate: ['골재'],
  lumber: ['목재', '제재목'],
  nickel: ['니켈'],
}

function responseEnvelope(json: any): any {
  return json?.response ?? json
}

function asItems(envelope: any): any[] {
  const items = envelope?.body?.items
  if (Array.isArray(items)) return items
  if (Array.isArray(items?.item)) return items.item
  return items?.item ? [items.item] : []
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function numberFrom(item: any): number {
  for (const key of ['unitPrce', 'unitPrc', 'prce', 'price', 'cntrctPrce', 'stdAmt']) {
    const value = Number(String(item?.[key] ?? '').replaceAll(',', ''))
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

export class PpsMaterialPriceProvider implements MaterialPriceProvider {
  readonly source = 'live' as const
  private serviceKey: string

  constructor(serviceKey: string) {
    this.serviceKey = normalizeDataGoKrServiceKey(serviceKey)
  }

  private async fetchItems(): Promise<any[]> {
    const endDate = new Date()
    const beginDate = new Date(endDate.getTime() - 366 * 86400000)
    const url = new URL(ENDPOINT)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('numOfRows', '1000')
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('inqryDiv', '1')
    url.searchParams.set('inqryBgnDate', dateKey(beginDate))
    url.searchParams.set('inqryEndDate', dateKey(endDate))
    url.searchParams.set('type', 'json')

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`PPS API error: ${response.status}`)
    const json: any = await response.json()
    const envelope = responseEnvelope(json)
    const resultCode = envelope?.header?.resultCode
    if (resultCode !== '00') throw new Error(`PPS API resultCode=${resultCode ?? 'unknown'}`)
    return asItems(envelope)
  }

  async healthCheck(): Promise<void> {
    await this.fetchItems()
  }

  async getPrices(materialKeys: string[]): Promise<MaterialPriceItem[]> {
    const items = await this.fetchItems()
    const result = materialKeys.flatMap((materialKey) => {
      const catalog = MATERIAL_CATALOG.find((entry) => entry.key === materialKey)
      const keywords = KEYWORDS[materialKey]
      if (!catalog || !keywords) return []
      const item = items.find((candidate) => keywords.some((keyword) => JSON.stringify(candidate).toLowerCase().includes(keyword.toLowerCase())))
      const price = numberFrom(item)
      if (!item || !price) return []
      const updatedAt = item.nticeDt ?? item.stdrDt ?? item.priceBasisDate ?? item.dataCrtrYmd ?? new Date().toISOString()
      return [{
        materialKey,
        label: catalog.label,
        price,
        unit: item.unit ?? item.unitNm ?? item.cntrctUnit ?? catalog.unit,
        currency: 'KRW',
        changeRate: 0,
        direction: 'flat' as const,
        hasTrend: false,
        source: '조달청 나라장터 가격정보현황서비스',
        updatedAt,
        isMock: false,
      }]
    })
    if (result.length !== materialKeys.length) throw new Error('PPS API 응답에 선택한 자재 가격이 없습니다')
    return result
  }
}
