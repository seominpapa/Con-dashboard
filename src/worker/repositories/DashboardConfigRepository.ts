/**
 * 로그인 사용자의 Dashboard 구성을 D1에 저장/조회한다.
 * MVP는 클라이언트 localStorage가 기본이지만, 로그인 사용자는 D1에도 동기화하여
 * AI Briefing이 "사용자의 현재 Dashboard Widget 구성"을 서버에서 알 수 있게 한다 (기획 39번).
 */
export interface StoredDashboardConfig {
  widgets: { widgetId: string; instanceId: string; hidden?: boolean; settings?: Record<string, unknown> }[]
  activeSiteId?: string
  [key: string]: unknown
}

export class DashboardConfigRepository {
  constructor(private db: D1Database) {}

  async get(userId: string): Promise<StoredDashboardConfig | null> {
    const row = await this.db.prepare('SELECT config_json FROM dashboard_configs WHERE user_id = ?').bind(userId).first<{ config_json: string }>()
    return row ? JSON.parse(row.config_json) : null
  }

  async save(userId: string, config: StoredDashboardConfig): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .prepare(
        `INSERT INTO dashboard_configs (id, user_id, config_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at`
      )
      .bind(`dc_${userId}`, userId, JSON.stringify(config), now)
      .run()
  }

  /** 활성 Widget ID 목록만 반환 (hidden 제외) */
  async getActiveWidgetIds(userId: string): Promise<string[]> {
    const config = await this.get(userId)
    if (!config) return []
    return config.widgets.filter((w) => !w.hidden).map((w) => w.widgetId)
  }
}
