/** 서비스 전역 설정 (기본 LLM Provider 등) key-value 저장소 */
export class SettingsRepository {
  constructor(private db: D1Database) {}

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
}

export const SETTINGS_KEY = {
  DEFAULT_LLM_PROVIDER: 'default_llm_provider', // 'claude' | 'codex'
} as const
