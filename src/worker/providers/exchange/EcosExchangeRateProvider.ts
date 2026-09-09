import type { ExchangeRateProvider } from './ExchangeRateProvider'
import { MATERIAL_CATALOG, type ExchangeRateItem, type TrendDirection, type TrendPoint } from '../../../shared/types/market'

/**
 * 한국은행 ECOS API 기반 환율 Provider
 * 통계표코드 731Y001 (시장평균환율) 사용
 */
const BASE_URL = 'https://ecos.bok.or.kr/api'
const STAT_CODE = '731Y001'
const PRODUCER_PRICE_STAT_CODE = '404Y014'

const PPI_KEYWORDS: Record<string, RegExp> = {
  'steel-plate': /후판|강판/,
  'light-steel': /형강/,
  'angle-steel': /형강/,
  'flat-steel': /평강/,
  'cold-rolled': /냉연.*강판|냉연박판/,
  'steel-pipe': /강관/,
  'square-pipe': /강관/,
  'concrete-pile': /콘크리트.*파일/,
  'gypsum-board': /석고보드/,
  'welded-mesh': /철망/,
  'eps-insulation': /발포.*폴리스티렌/,
  mortar: /모르타르/,
  asphalt: /아스팔트/,
  lumber: /목재/,
  rebar: /철근/,
  'h-beam': /h.?형강/,
  copper: /동\b|동제품/,
  aluminum: /알루미늄/,
  cement: /시멘트/,
  remicon: /레미콘|레디믹스트/,
  aggregate: /골재|쇄석|모래/,
  nickel: /니켈/,
}

interface ProducerPriceIndex {
  materialKey: string
  value: number
  changeRate: number
  asOf: string
}

// ECOS 731Y001 항목코드 (통화별)
const ITEM_CODE: Record<string, { code: string; label: string }> = {
  USD: { code: '0000001', label: 'USD/KRW' },
  EUR: { code: '0000003', label: 'EUR/KRW' },
  JPY: { code: '0000002', label: 'JPY/KRW' }, // 100엔 기준
  CNY: { code: '0000053', label: 'CNY/KRW' },
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export class EcosExchangeRateProvider implements ExchangeRateProvider {
  readonly source = 'live' as const
  constructor(private apiKey: string) {}

  private async fetchSeries(itemCode: string, days: number): Promise<{ date: string; value: number }[]> {
    const end = new Date()
    const start = new Date(end.getTime() - days * 86400000)
    const url = `${BASE_URL}/StatisticSearch/${this.apiKey}/json/kr/1/${days}/${STAT_CODE}/D/${fmtDate(start)}/${fmtDate(end)}/${itemCode}`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`ECOS API error: ${res.status}`)
    const json: any = await res.json()
    const rows = json?.StatisticSearch?.row
    if (!rows || rows.length === 0) throw new Error('ECOS: 데이터 없음')
    return rows.map((r: any) => ({ date: r.TIME, value: Number(r.DATA_VALUE) }))
  }

  async getRates(codes: string[]): Promise<ExchangeRateItem[]> {
    const targets = codes.length ? codes : Object.keys(ITEM_CODE)

    const results = await Promise.allSettled(
      targets.map(async (code) => {
        const meta = ITEM_CODE[code]
        if (!meta) throw new Error(`지원하지 않는 통화: ${code}`)
        const series = await this.fetchSeries(meta.code, 35)
        const latest = series[series.length - 1]
        const prev = series[series.length - 2] ?? latest
        const changeValue = Math.round((latest.value - prev.value) * 100) / 100
        const direction: TrendDirection = changeValue > 0.01 ? 'up' : changeValue < -0.01 ? 'down' : 'flat'

        const weeklyTrend: TrendPoint[] = series.slice(-7).map((r) => ({ label: r.date.slice(4), value: r.value }))
        const monthlyTrend: TrendPoint[] = series.slice(-30).map((r) => ({ label: r.date.slice(4), value: r.value }))

        return {
          code,
          pairLabel: meta.label,
          rate: latest.value,
          asOf: `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`,
          changeValue,
          changeRate: Math.round((changeValue / prev.value) * 10000) / 100,
          direction,
          weeklyTrend,
          monthlyTrend,
        } as ExchangeRateItem
      })
    )

    const items = results.filter((r): r is PromiseFulfilledResult<ExchangeRateItem> => r.status === 'fulfilled').map((r) => r.value)
    if (items.length === 0) throw new Error('ECOS: 모든 통화 조회 실패')
    return items
  }

  async getProducerPriceIndices(materialKeys: string[]): Promise<ProducerPriceIndex[]> {
    const itemUrl = `${BASE_URL}/StatisticItemList/${this.apiKey}/json/kr/1/1000/${PRODUCER_PRICE_STAT_CODE}`
    const response = await fetch(itemUrl, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`ECOS 생산자물가 API error: ${response.status}`)
    const rows = ((await response.json()) as any)?.StatisticItemList?.row
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('ECOS 생산자물가: 항목 없음')
    const end = new Date()
    const start = new Date(end.getFullYear(), end.getMonth() - 5, 1)
    const period = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
    const requested = materialKeys.filter((key) => MATERIAL_CATALOG.some((item) => item.key === key))
    const matched = requested.flatMap((materialKey) => {
      const keyword = PPI_KEYWORDS[materialKey]
      const row = keyword && rows.find((item: any) => item.CYCLE === 'M' && keyword.test(String(item.ITEM_NAME ?? '')))
      return row ? [{ materialKey, itemCode: String(row.ITEM_CODE) }] : []
    })
    const results = await Promise.allSettled(matched.map(async ({ materialKey, itemCode }) => {
      const url = `${BASE_URL}/StatisticSearch/${this.apiKey}/json/kr/1/6/${PRODUCER_PRICE_STAT_CODE}/M/${period(start)}/${period(end)}/${itemCode}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`ECOS 생산자물가 API error: ${res.status}`)
      const series = ((await res.json()) as any)?.StatisticSearch?.row
      if (!Array.isArray(series) || series.length === 0) throw new Error('ECOS 생산자물가: 데이터 없음')
      const latest = series.at(-1)
      const previous = series.at(-2) ?? latest
      const value = Number(latest.DATA_VALUE)
      const previousValue = Number(previous.DATA_VALUE)
      if (!Number.isFinite(value) || !Number.isFinite(previousValue)) throw new Error('ECOS 생산자물가: 값 형식 오류')
      return {
        materialKey,
        value,
        changeRate: previousValue ? Math.round(((value - previousValue) / previousValue) * 10_000) / 100 : 0,
        asOf: `${String(latest.TIME).slice(0, 4)}-${String(latest.TIME).slice(4, 6)}`,
      }
    }))
    return results.filter((result): result is PromiseFulfilledResult<{ materialKey: string; value: number; changeRate: number; asOf: string }> => result.status === 'fulfilled').map((result) => result.value)
  }
}
