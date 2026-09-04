/** 나라장터 입찰공고 도메인 모델 */

export interface BidNotice {
  id: string
  title: string
  organization: string
  /** 예정금액 또는 기초금액 (원) */
  estimatedAmount: number
  announcedDate: string
  deadlineDate: string
  region: string
  workType: string
  url?: string
}

export interface BidFilter {
  id: string
  name: string
  regions: string[]
  workTypes: string[]
  keyword?: string
  organization?: string
  minAmount?: number
  maxAmount?: number
}
