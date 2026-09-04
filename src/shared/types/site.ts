/** 건설 현장(Site) 도메인 모델 */
export type SiteStatus = 'active' | 'planned' | 'completed' | 'suspended'

export interface Site {
  id: string
  name: string
  company: string
  address: string
  latitude: number
  longitude: number
  /** 기상청 격자 좌표 X */
  kmaNx: number
  /** 기상청 격자 좌표 Y */
  kmaNy: number
  startDate: string
  endDate: string
  status: SiteStatus
  /** AirKorea 측정소명 (선택 지정, 없으면 위경도로 최근접 측정소 조회) */
  airkoreaStationName?: string
}

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  active: '진행중',
  planned: '착공예정',
  completed: '준공',
  suspended: '중지',
}
