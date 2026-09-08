import type { BriefingStructuredContent } from '../../shared/types/briefing'
import { generateId } from '../auth/session'

interface BriefingRow {
  id: string
  user_id: string
  site_id: string | null
  briefing_date: string
  provider: string
  model: string | null
  content: string | null
  structured_content: string
  context_hash: string | null
  status: string
  error_message: string | null
  generated_at: string
}

export interface StoredBriefing {
  id: string
  briefingDate: string
  provider: string
  model: string | null
  structured: BriefingStructuredContent
  status: 'success' | 'error'
  errorMessage?: string | null
  generatedAt: string
}

function rowToBriefing(row: BriefingRow): StoredBriefing {
  return {
    id: row.id,
    briefingDate: row.briefing_date,
    provider: row.provider,
    model: row.model,
    structured: JSON.parse(row.structured_content),
    status: row.status as 'success' | 'error',
    errorMessage: row.error_message,
    generatedAt: row.generated_at,
  }
}

/**
 * AI Briefing 저장소 (기획 42번)
 * userId + briefingDate UNIQUE 제약으로 하루 1회 생성을 DB 레벨에서 보장한다.
 */
export class AiBriefingRepository {
  constructor(private db: D1Database) {}

  async findByUserAndDate(userId: string, briefingDate: string): Promise<StoredBriefing | null> {
    const row = await this.db
      .prepare('SELECT * FROM ai_briefings WHERE user_id = ? AND briefing_date = ?')
      .bind(userId, briefingDate)
      .first<BriefingRow>()
    return row ? rowToBriefing(row) : null
  }

  async deleteErrorByUserAndDate(userId: string, briefingDate: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM ai_briefings WHERE user_id = ? AND briefing_date = ? AND status = 'error'")
      .bind(userId, briefingDate)
      .run()
  }

  async deleteLegacyEmptySuccessById(id: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM ai_briefings WHERE id = ? AND status = 'success'")
      .bind(id)
      .run()
  }

  /**
   * 동시 요청 시 중복 생성을 막기 위해 INSERT OR IGNORE 사용.
   * D1(SQLite)의 UNIQUE(user_id, briefing_date) 제약이 실제 방어선이다.
   * 반환값이 false면 이미 다른 요청이 먼저 생성했다는 뜻 -> 호출부는 findByUserAndDate로 재조회.
   */
  async tryInsert(params: {
    userId: string
    siteId: string | null
    briefingDate: string
    provider: string
    model: string | null
    structured: BriefingStructuredContent
    contextHash: string
    status: 'success' | 'error'
    errorMessage?: string
  }): Promise<boolean> {
    const id = generateId('brief')
    const now = new Date().toISOString()
    try {
      await this.db
        .prepare(
          `INSERT INTO ai_briefings (id, user_id, site_id, briefing_date, provider, model, structured_content, context_hash, status, error_message, generated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          params.userId,
          params.siteId,
          params.briefingDate,
          params.provider,
          params.model,
          JSON.stringify(params.structured),
          params.contextHash,
          params.status,
          params.errorMessage ?? null,
          now,
          now
        )
        .run()
      return true
    } catch (err: any) {
      // UNIQUE constraint 충돌 = 이미 존재 (동시성 방어 성공)
      if (String(err.message ?? '').includes('UNIQUE')) return false
      throw err
    }
  }
}
