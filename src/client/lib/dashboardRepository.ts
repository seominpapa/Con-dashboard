import { api } from './api'

/** Dashboard에 배치된 Widget 1개 인스턴스 */
export interface DashboardWidgetInstance {
  widgetId: string
  instanceId: string
  hidden?: boolean
  settings?: Record<string, unknown>
}

export interface DashboardConfig {
  /** PC/태블릿용 배치 순서 */
  desktopOrder: DashboardWidgetInstance[]
  /** 모바일용 배치 순서 (기획 24번: 데스크톱/모바일 별도 저장) */
  mobileOrder: DashboardWidgetInstance[]
  activeSiteId: string | null
}

const STORAGE_KEY = 'construction-dashboard:config:v1'

/**
 * DashboardRepository 인터페이스 (기획 2번)
 * MVP는 localStorage 구현체를 사용하지만, 이 인터페이스를 유지한 채
 * 나중에 DB(서버 D1) 구현체로 교체해도 Widget/Dashboard 코드는 변경할 필요가 없다.
 */
export interface DashboardRepository {
  load(): DashboardConfig | null
  save(config: DashboardConfig): void
}

class LocalStorageDashboardRepository implements DashboardRepository {
  load(): DashboardConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as DashboardConfig
    } catch {
      return null
    }
  }

  save(config: DashboardConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      /* localStorage 사용 불가(사파리 프라이빗모드 등) 시 조용히 무시 */
    }
  }
}

export const dashboardRepository: DashboardRepository = new LocalStorageDashboardRepository()

/** 신규 사용자 기본 위젯 배치 순서 (기획 24번) */
export const DEFAULT_WIDGET_ORDER = [
  'siteSummary',
  'weatherAlert',
  'weather',
  'aiBriefing',
  'todo',
  'calendar',
  'airQuality',
  'bidding',
  'constructionNews',
  'marketSummary',
  'exchangeRate',
  'oilPrice',
  'materialPrice',
  'law',
]

export function createDefaultConfig(): DashboardConfig {
  const order = DEFAULT_WIDGET_ORDER.map((widgetId, i) => ({
    widgetId,
    instanceId: `${widgetId}-default-${i}`,
  }))
  return { desktopOrder: order, mobileOrder: order, activeSiteId: null }
}

/**
 * 로그인 사용자는 서버(D1)에도 현재 Dashboard 구성을 동기화한다.
 * 이는 AI Briefing이 "사용자의 현재 Dashboard에 어떤 Widget이 있는지"를
 * 서버에서 판단할 수 있게 하기 위함이다 (기획 39번). 실패해도 로컬 저장은
 * 이미 완료된 상태이므로 UX에 영향 없이 조용히 무시한다.
 */
export function syncDashboardConfigToServer(config: DashboardConfig): void {
  api
    .put('/api/dashboard/config', {
      widgets: config.desktopOrder.map((w) => ({ widgetId: w.widgetId, instanceId: w.instanceId, hidden: w.hidden, settings: w.settings })),
      activeSiteId: config.activeSiteId ?? undefined,
    })
    .catch(() => {
      /* 서버 동기화 실패는 무시 (localStorage가 이미 source of truth) */
    })
}
