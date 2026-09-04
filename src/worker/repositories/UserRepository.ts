import type { User, UserRole, UserStatus } from '../../shared/types/user'
import { generateId } from '../auth/session'

interface UserRow {
  id: string
  email: string
  name: string
  profile_image: string | null
  google_id: string
  role: UserRole
  status: UserStatus
  created_at: string
  approved_at: string | null
  approved_by: string | null
  last_login_at: string | null
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    profileImage: row.profile_image,
    googleId: row.google_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    lastLoginAt: row.last_login_at,
  }
}

/**
 * 사용자 데이터 접근 계층.
 * 인증/승인 로직(AuthService)이 이 Repository를 통해서만 users 테이블에 접근한다.
 */
export class UserRepository {
  constructor(private db: D1Database) {}

  async findByGoogleId(googleId: string): Promise<User | null> {
    const row = await this.db.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleId).first<UserRow>()
    return row ? rowToUser(row) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
    return row ? rowToUser(row) : null
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
    return row ? rowToUser(row) : null
  }

  async create(params: {
    email: string
    name: string
    profileImage?: string | null
    googleId: string
    role: UserRole
    status: UserStatus
  }): Promise<User> {
    const id = generateId('user')
    const now = new Date().toISOString()
    const approvedAt = params.status === 'APPROVED' ? now : null
    const approvedBy = params.status === 'APPROVED' ? 'system-bootstrap' : null
    await this.db
      .prepare(
        `INSERT INTO users (id, email, name, profile_image, google_id, role, status, created_at, approved_at, approved_by, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, params.email, params.name, params.profileImage ?? null, params.googleId, params.role, params.status, now, approvedAt, approvedBy, now)
      .run()
    return {
      id,
      email: params.email,
      name: params.name,
      profileImage: params.profileImage ?? null,
      googleId: params.googleId,
      role: params.role,
      status: params.status,
      createdAt: now,
      approvedAt,
      approvedBy,
      lastLoginAt: now,
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
  }

  async approve(id: string, approvedByUserId: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .prepare('UPDATE users SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?')
      .bind('APPROVED', now, approvedByUserId, id)
      .run()
  }

  async reject(id: string, rejectedByUserId: string): Promise<void> {
    await this.db.prepare('UPDATE users SET status = ?, approved_by = ? WHERE id = ?').bind('REJECTED', rejectedByUserId, id).run()
  }

  async suspend(id: string): Promise<void> {
    await this.db.prepare('UPDATE users SET status = ? WHERE id = ?').bind('SUSPENDED', id).run()
  }

  /** 승인 취소: APPROVED -> PENDING */
  async revokeApproval(id: string): Promise<void> {
    await this.db.prepare('UPDATE users SET status = ?, approved_at = NULL, approved_by = NULL WHERE id = ?').bind('PENDING', id).run()
  }

  async changeRole(id: string, role: UserRole): Promise<void> {
    await this.db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run()
  }

  async listAll(): Promise<User[]> {
    const { results } = await this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all<UserRow>()
    return (results ?? []).map(rowToUser)
  }

  async listByStatus(status: UserStatus): Promise<User[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM users WHERE status = ? ORDER BY created_at ASC')
      .bind(status)
      .all<UserRow>()
    return (results ?? []).map(rowToUser)
  }

  async countAdmins(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN'").first<{ cnt: number }>()
    return row?.cnt ?? 0
  }
}
