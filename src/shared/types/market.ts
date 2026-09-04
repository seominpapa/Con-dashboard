/** 경제·원가(환율/유가/자재가격) 도메인 모델 */
import type { TrendDirection, TrendPoint } from './common'

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

export type OilKind = 'dubai' | 'wti' | 'brent' | 'domestic-diesel' | 'domestic-gasoline'

export interface OilPriceItem {
  kind: OilKind
  label: string
  unit: string
  currency: string
  price: number
  changeValue: number
  weeklyChangeRate: number
  monthlyChangeRate: number
  direction: TrendDirection
  trend: TrendPoint[]
}

export interface MaterialPriceItem {
  materialKey: string
  label: string
  price: number
  unit: string
  currency: string
  changeRate: number
  direction: TrendDirection
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

export const OIL_KIND_LABEL: Record<OilKind, string> = {
  dubai: 'Dubai',
  wti: 'WTI',
  brent: 'Brent',
  'domestic-diesel': '국내 경유',
  'domestic-gasoline': '국내 휘발유',
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
  { key: 'crude-oil', label: '원유', unit: 'barrel' },
  { key: 'nickel', label: '니켈', unit: 'ton' },
]
