/** 서비스 전역 설정 (기본 LLM Provider 등) key-value 저장소 */
export class SettingsRepository {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  async get(key: string): Promise<string | null> {
    const row = await this.db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>()
    return row?.value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      )
      .bind(key, value, new Date().toISOString())
      .run()
  }

  async delete(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM app_settings WHERE key = ?').bind(key).run()
  }

  async consumeFixedWindow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = new Date().toISOString()
    const row = await this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, '1', ?)
         ON CONFLICT(key) DO UPDATE SET
           value=CASE WHEN unixepoch(app_settings.updated_at) <= unixepoch(excluded.updated_at) - ? THEN '1' ELSE CAST(CAST(app_settings.value AS INTEGER) + 1 AS TEXT) END,
           updated_at=CASE WHEN unixepoch(app_settings.updated_at) <= unixepoch(excluded.updated_at) - ? THEN excluded.updated_at ELSE app_settings.updated_at END
         WHERE unixepoch(app_settings.updated_at) <= unixepoch(excluded.updated_at) - ? OR CAST(app_settings.value AS INTEGER) < ?
         RETURNING value`
      )
      .bind(key, now, windowSeconds, windowSeconds, windowSeconds, limit)
      .first<{ value: string }>()
    return Number(row?.value) <= limit
  }
}

export const SETTINGS_KEY = {
  DEFAULT_LLM_PROVIDER: 'default_llm_provider', // 'claude' | 'codex'
} as const
