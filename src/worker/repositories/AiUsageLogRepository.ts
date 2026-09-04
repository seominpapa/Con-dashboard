import { generateId } from '../auth/session'

/** AI 사용량 로그 (기획 50번 - 관리자 화면에서 Usage 집계용) */
export class AiUsageLogRepository {
  constructor(private db: D1Database) {}

  async log(params: {
    userId: string | null
    provider: string
    model: string | null
    purpose: 'briefing' | 'chat'
    inputTokens: number
    outputTokens: number
    success: boolean
    errorMessage?: string
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO ai_usage_logs (id, user_id, provider, model, purpose, input_tokens, output_tokens, success, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        generateId('usage'),
        params.userId,
        params.provider,
        params.model,
        params.purpose,
        params.inputTokens,
        params.outputTokens,
        params.success ? 1 : 0,
        params.errorMessage ?? null,
        new Date().toISOString()
      )
      .run()
  }

  async getSummaryByDate(days = 30): Promise<{ date: string; provider: string; briefingCount: number; inputTokens: number; outputTokens: number }[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { results } = await this.db
      .prepare(
        `SELECT date(created_at) as date, provider, COUNT(*) as briefingCount, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens
         FROM ai_usage_logs WHERE created_at >= ? AND success = 1
         GROUP BY date(created_at), provider ORDER BY date DESC`
      )
      .bind(since)
      .all()
    return (results ?? []) as any
  }
}
