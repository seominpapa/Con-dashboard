import type { ExchangeRateProvider } from './ExchangeRateProvider'
import type { ExchangeRateItem, TrendDirection, TrendPoint } from '../../../shared/types/market'

/**
 * 한국은행 ECOS API 기반 환율 Provider
 * 통계표코드 731Y001 (시장평균환율) 사용
 */
const BASE_URL = 'https://ecos.bok.or.kr/api'
const STAT_CODE = '731Y001'

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
    const url = `${BASE_URL}/StatisticSearch/${this.apiKey}/json/kr/1/${days}/${STAT_CODE}/DD/${fmtDate(start)}/${fmtDate(end)}/${itemCode}`

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
}
