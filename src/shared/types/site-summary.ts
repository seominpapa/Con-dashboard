/** 오늘의 현장 요약 도메인 모델 */

export interface SiteIssue {
  id: string
  text: string
  severity: 'info' | 'warning' | 'critical'
}

export interface SiteSummaryToday {
  siteId: string
  siteName: string
  date: string
  workTypeCount: number
  workerCount: number
  equipmentCount: number
  riskWorkCount: number
  delayCount: number
  issues: SiteIssue[]
}
