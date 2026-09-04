/** 일정관리 도메인 모델 */
export type ScheduleImportance = 'high' | 'normal' | 'low'
export type ScheduleCategory = 'meeting' | 'inspection' | 'delivery' | 'safety' | 'admin' | 'etc'

export interface ScheduleEvent {
  id: string
  title: string
  description?: string
  /** ISO datetime */
  startAt: string
  /** ISO datetime */
  endAt: string
  location?: string
  attendees?: string[]
  siteId?: string
  category: ScheduleCategory
  importance: ScheduleImportance
  createdAt: string
  updatedAt: string
  /** 향후 Google Calendar 연동 시 원본 이벤트 ID */
  externalId?: string
  externalProvider?: 'google' | null
}

export const SCHEDULE_CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  meeting: '회의',
  inspection: '점검',
  delivery: '자재반입',
  safety: '안전',
  admin: '행정',
  etc: '기타',
}

export const SCHEDULE_IMPORTANCE_LABEL: Record<ScheduleImportance, string> = {
  high: '중요',
  normal: '보통',
  low: '낮음',
}
