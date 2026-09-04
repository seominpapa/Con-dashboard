import type { ComponentType } from 'react'

export type WidgetCategory = '업무' | '현장환경' | '수주정보' | '경제원가'

export interface WidgetSize {
  /** Grid columns span (1~4) */
  w: number
  /** Grid rows span (unit rows) */
  h: number
}

export interface WidgetLayoutItem {
  widgetId: string
  /** Dashboard 내 인스턴스 고유 ID (동일 widget 여러개 배치 가능성 대비) */
  instanceId: string
  x: number
  y: number
  w: number
  h: number
  hidden?: boolean
  settings?: Record<string, unknown>
}

export interface WidgetSettingsFieldOption {
  value: string
  label: string
}

export interface WidgetSettingsField {
  key: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'number' | 'boolean'
  options?: WidgetSettingsFieldOption[]
  defaultValue?: unknown
  placeholder?: string
}

export interface WidgetProps {
  instanceId: string
  siteId: string
  settings: Record<string, unknown>
  onSettingsChange: (settings: Record<string, unknown>) => void
}

export interface WidgetDefinition {
  id: string
  title: string
  description: string
  category: WidgetCategory
  icon: string // lucide-react icon name
  component: ComponentType<WidgetProps>
  defaultSize: WidgetSize
  minSize: WidgetSize
  maxSize: WidgetSize
  settingsSchema?: WidgetSettingsField[]
  /** ms, 0이면 자동 refresh 없음 */
  refreshInterval: number
  supportsLocation: boolean
  supportsManualRefresh: boolean
  /** 전체보기 페이지 경로 (없으면 전체보기 버튼 숨김) */
  detailPath?: string
}
