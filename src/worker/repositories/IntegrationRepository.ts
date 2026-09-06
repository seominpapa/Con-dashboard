import type { IntegrationStatus, IntegrationType, IntegrationSummary } from '../../shared/types/integration'
import { encryptCredential, decryptCredential } from '../crypto/encryption'
import { generateId } from '../auth/session'

interface IntegrationRow {
  id: string
  provider: string
  type: IntegrationType
  status: IntegrationStatus
  encrypted_credential: string | null
  metadata: string | null
  connected_at: string | null
  last_checked_at: string | null
  last_success_at: string | null
  last_error: string | null
  updated_by: string | null
  updated_at: string
}

function rowToSummary(row: IntegrationRow): IntegrationSummary {
  return {
    provider: row.provider,
    type: row.type,
    status: row.status,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    connectedAt: row.connected_at,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    updatedBy: row.updated_by,
    envFallbackAvailable: false, // 호출부에서 채움
  }
}

/**
 * 관리자 중앙 API/AI Provider Credential 저장소.
 *
 * 보안 원칙 (기획 34번):
 * - 평문 저장 절대 금지 (encrypted_credential 컬럼만 사용)
 * - 복호화된 Credential은 서버 내부(Provider 생성 직전)에서만 사용
 * - Client Response에는 절대 원본 Credential을 포함하지 않는다 (getSummaries만 노출용)
 * - 로그에 Credential을 출력하지 않는다
 */
export class IntegrationRepository {
  constructor(private db: D1Database, private authSecret: string) {}

  async getSummary(provider: string): Promise<IntegrationSummary | null> {
    const row = await this.db.prepare('SELECT * FROM integrations WHERE provider = ?').bind(provider).first<IntegrationRow>()
    return row ? rowToSummary(row) : null
  }

  async listSummaries(): Promise<IntegrationSummary[]> {
    const { results } = await this.db.prepare('SELECT * FROM integrations').all<IntegrationRow>()
    return (results ?? []).map(rowToSummary)
  }

  /** 서버 내부 전용: 복호화된 credential 객체 반환. Route Handler에서 Client로 절대 전달 금지 */
  async getDecryptedCredential<T = Record<string, string>>(provider: string): Promise<T | null> {
    const row = await this.db.prepare('SELECT encrypted_credential FROM integrations WHERE provider = ?').bind(provider).first<{ encrypted_credential: string | null }>()
    if (!row || !row.encrypted_credential) return null
    const plain = await decryptCredential(row.encrypted_credential, this.authSecret)
    return JSON.parse(plain) as T
  }

  async isConnected(provider: string): Promise<boolean> {
    const summary = await this.getSummary(provider)
    return summary?.status === 'CONNECTED'
  }

  /** 관리자가 Credential을 입력/갱신할 때 사용. credential은 즉시 암호화되어 저장된다. */
  async upsertCredential(params: {
    provider: string
    type: IntegrationType
    credential: Record<string, string>
    metadata?: Record<string, unknown>
    updatedBy: string
  }): Promise<void> {
    const encrypted = await encryptCredential(JSON.stringify(params.credential), this.authSecret)
    const now = new Date().toISOString()
    const existing = await this.db.prepare('SELECT id FROM integrations WHERE provider = ?').bind(params.provider).first<{ id: string }>()

    if (existing) {
      await this.db
        .prepare(
          `UPDATE integrations SET type=?, status='CONNECTED', encrypted_credential=?, metadata=?, connected_at=?, updated_by=?, updated_at=? WHERE provider=?`
        )
        .bind(params.type, encrypted, JSON.stringify(params.metadata ?? {}), now, params.updatedBy, now, params.provider)
        .run()
    } else {
      await this.db
        .prepare(
          `INSERT INTO integrations (id, provider, type, status, encrypted_credential, metadata, connected_at, updated_by, updated_at)
           VALUES (?, ?, ?, 'CONNECTED', ?, ?, ?, ?, ?)`
        )
        .bind(generateId('intg'), params.provider, params.type, encrypted, JSON.stringify(params.metadata ?? {}), now, params.updatedBy, now)
        .run()
    }
  }

  async disconnect(provider: string, updatedBy: string): Promise<void> {
    await this.db
      .prepare(`UPDATE integrations SET status='DISCONNECTED', encrypted_credential=NULL, connected_at=NULL, last_error=NULL, updated_by=?, updated_at=? WHERE provider=?`)
      .bind(updatedBy, new Date().toISOString(), provider)
      .run()
  }

  async recordCheckResult(provider: string, success: boolean, errorMessage?: string): Promise<void> {
    const now = new Date().toISOString()
    if (success) {
      await this.db
        .prepare(`UPDATE integrations SET status='CONNECTED', last_checked_at=?, last_success_at=?, last_error=NULL, updated_at=? WHERE provider=?`)
        .bind(now, now, now, provider)
        .run()
    } else {
      await this.db
        .prepare(`UPDATE integrations SET status='ERROR', last_checked_at=?, last_error=?, updated_at=? WHERE provider=?`)
        .bind(now, errorMessage ?? 'unknown error', now, provider)
        .run()
    }
  }

  async ensureRow(provider: string, type: IntegrationType): Promise<void> {
    const existing = await this.db.prepare('SELECT id FROM integrations WHERE provider = ?').bind(provider).first<{ id: string }>()
    if (!existing) {
      await this.db
        .prepare(`INSERT INTO integrations (id, provider, type, status, updated_at) VALUES (?, ?, ?, 'DISCONNECTED', ?)`)
        .bind(generateId('intg'), provider, type, new Date().toISOString())
        .run()
    }
  }
}
