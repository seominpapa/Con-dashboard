/** 경제·원가(환율/자재가격) 도메인 모델 */
import type { TrendDirection, TrendPoint } from './common'

export type { TrendDirection, TrendPoint }

export interface ExchangeRateItem {
  code: string // USD, EUR, JPY, CNY
  pairLabel: string // USD/KRW
  rate: number
  /** 기준 영업일 YYYY-MM-DD */
  asOf?: string
  changeValue: number
  changeRate: number
  direction: TrendDirection
  weeklyTrend: TrendPoint[]
  monthlyTrend: TrendPoint[]
}

export interface MaterialPriceItem {
  materialKey: string
  label: string
  /** 조달청 품목 규격명 (기준가격이 어떤 규격인지 표시) */
  spec?: string
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
  /** 조달청 기준가격이 없어 한국은행 ECOS 지수만 표시하는 품목인지 여부 */
  indexOnly?: boolean
  /** 한국은행 ECOS 생산자물가지수(월간). 절대 가격이 아니라 변동 참고 지표다. */
  producerPriceIndex?: { value: number; changeRate: number; asOf: string }
}

export interface MarketSummaryIndicator {
  key: string
  label: string
  changeRate: number
  direction: TrendDirection
  displayValue: string
}

/**
 * pps: 조달청 가격정보현황서비스(시설공통자재)의 품목분류명. 없는 자재(철근·시멘트 등)는
 * 조달청이 제공하지 않아 참고용 Mock으로만 표시된다. 조달청 제공 자재를 앞에 둔다.
 */
export const MATERIAL_CATALOG: { key: string; label: string; unit: string; pps?: { cls: string; unit: string } }[] = [
  { key: 'steel-plate', label: '후판', unit: 'ton', pps: { cls: '일반구조용압연강판', unit: '톤' } },
  { key: 'light-steel', label: '경량형강', unit: 'ton', pps: { cls: '경량형강', unit: '톤' } },
  { key: 'angle-steel', label: 'ㄱ형강', unit: 'kg', pps: { cls: 'ㄱ형강', unit: 'kg' } },
  { key: 'flat-steel', label: '평강', unit: 'ton', pps: { cls: '평강', unit: '톤' } },
  { key: 'cold-rolled', label: '냉연박판', unit: 'ton', pps: { cls: '냉연박판', unit: 'ton' } },
  { key: 'steel-pipe', label: '배관용 탄소강관', unit: 'm', pps: { cls: '배관용 탄소강관', unit: 'm' } },
  { key: 'square-pipe', label: '각형강관', unit: 'm', pps: { cls: '일반구조용각형강관', unit: 'm' } },
  { key: 'concrete-pile', label: '콘크리트파일', unit: '본', pps: { cls: '콘크리트파일', unit: '본' } },
  { key: 'gypsum-board', label: '석고보드', unit: '㎡', pps: { cls: '석고보드', unit: '㎡' } },
  { key: 'welded-mesh', label: '용접철망', unit: '㎡', pps: { cls: '용접철망', unit: '㎡' } },
  { key: 'eps-insulation', label: '발포폴리스티렌단열재', unit: '㎡', pps: { cls: '발포폴리스티렌단열재', unit: '㎡' } },
  { key: 'mortar', label: '모르타르', unit: 'kg', pps: { cls: '모르타르', unit: 'kg' } },
  { key: 'asphalt', label: '아스팔트', unit: 'kg', pps: { cls: '아스팔트', unit: 'kg' } },
  { key: 'lumber', label: '목재', unit: 'm³', pps: { cls: '목재판재', unit: '㎥' } },
  { key: 'rebar', label: '철근', unit: 'ton' },
  { key: 'h-beam', label: 'H형강', unit: 'ton' },
  { key: 'copper', label: '동', unit: 'ton' },
  { key: 'aluminum', label: '알루미늄', unit: 'ton' },
  { key: 'cement', label: '시멘트', unit: 'ton' },
  { key: 'remicon', label: '레미콘', unit: 'm³' },
  { key: 'aggregate', label: '골재', unit: 'm³' },
  { key: 'nickel', label: '니켈', unit: 'ton' },
]
