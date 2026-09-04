/** AI Briefing 도메인 모델 (기획 38~51) */

export type BriefingPriorityLevel = 'high' | 'normal' | 'low'

export interface BriefingPriorityItem {
  level: BriefingPriorityLevel
  title: string
  reason: string
  sourceWidgets: string[]
}

export interface BriefingListItem {
  title: string
  detail: string
  sourceWidgets: string[]
}

/** 기획 44번 Structured Output 구조 */
export interface BriefingStructuredContent {
  summary: string
  priorityItems: BriefingPriorityItem[]
  scheduleItems: BriefingListItem[]
  riskItems: BriefingListItem[]
  marketItems: BriefingListItem[]
  informationItems: BriefingListItem[]
}

export type BriefingStatus = 'ready' | 'generating' | 'error' | 'unavailable'

export interface AiBriefingResponse {
  status: BriefingStatus
  briefingDate: string
  provider?: string
  model?: string
  structured?: BriefingStructuredContent
  message?: string
  generatedAt?: string
}
