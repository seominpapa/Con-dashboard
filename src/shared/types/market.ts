/** 경제·원가(환율/자재가격) 도메인 모델 */
import type { TrendDirection, TrendPoint } from './common'

export type { TrendDirection, TrendPoint }

export interface ExchangeRateItem {
  code: string // USD, EUR, JPY, CNY
  pairLabel: string // USD/KRW
  rate: number
  changeValue: number
  changeRate: number
  direction: TrendDirection
  weeklyTrend: TrendPoint[]
  monthlyTrend: TrendPoint[]
}

export interface MaterialPriceItem {
  materialKey: string
  label: string
  price: number
  unit: string
  currency: string
  changeRate: number
  direction: TrendDirection
  /** 조달청 기준가격은 전일 대비 시세가 아니므로 변동률을 표시하지 않는다. */
  hasTrend?: boolean
  source: string
  updatedAt: string
  isMock: boolean
}

export interface MarketSummaryIndicator {
  key: string
  label: string
  changeRate: number
  direction: TrendDirection
  displayValue: string
}

export const MATERIAL_CATALOG: { key: string; label: string; unit: string }[] = [
  { key: 'rebar', label: '철근', unit: 'ton' },
  { key: 'h-beam', label: 'H형강', unit: 'ton' },
  { key: 'steel-plate', label: '후판', unit: 'ton' },
  { key: 'copper', label: '동', unit: 'ton' },
  { key: 'aluminum', label: '알루미늄', unit: 'ton' },
  { key: 'cement', label: '시멘트', unit: 'ton' },
  { key: 'remicon', label: '레미콘', unit: 'm³' },
  { key: 'asphalt', label: '아스팔트', unit: 'ton' },
  { key: 'aggregate', label: '골재', unit: 'm³' },
  { key: 'lumber', label: '목재', unit: 'm³' },
  { key: 'nickel', label: '니켈', unit: 'ton' },
]
