import type { ScheduleEvent, ScheduleCategory, ScheduleImportance } from '../../shared/types/schedule'
import { generateId } from '../auth/session'

interface ScheduleRow {
  id: string
  user_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  location: string | null
  attendees: string | null
  site_id: string | null
  category: ScheduleCategory
  importance: ScheduleImportance
  external_id: string | null
  external_provider: string | null
  created_at: string
  updated_at: string
}

function rowToEvent(row: ScheduleRow): ScheduleEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location ?? undefined,
    attendees: row.attendees ? JSON.parse(row.attendees) : undefined,
    siteId: row.site_id ?? undefined,
    category: row.category,
    importance: row.importance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    externalId: row.external_id ?? undefined,
    externalProvider: (row.external_provider as any) ?? null,
  }
}

export class ScheduleRepository {
  constructor(private db: D1Database) {}

  async listByUser(userId: string, fromISO?: string, toISO?: string): Promise<ScheduleEvent[]> {
    let query = 'SELECT * FROM schedules WHERE user_id = ?'
    const binds: any[] = [userId]
    if (fromISO) {
      query += ' AND end_at >= ?'
      binds.push(fromISO)
    }
    if (toISO) {
      query += ' AND start_at <= ?'
      binds.push(toISO)
    }
    query += ' ORDER BY start_at ASC'
    const { results } = await this.db.prepare(query).bind(...binds).all<ScheduleRow>()
    return (results ?? []).map(rowToEvent)
  }

  async create(userId: string, input: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScheduleEvent> {
    const id = generateId('sched')
    const now = new Date().toISOString()
    await this.db
      .prepare(
        `INSERT INTO schedules (id, user_id, title, description, start_at, end_at, location, attendees, site_id, category, importance, external_id, external_provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        userId,
        input.title,
        input.description ?? null,
        input.startAt,
        input.endAt,
        input.location ?? null,
        input.attendees ? JSON.stringify(input.attendees) : null,
        input.siteId ?? null,
        input.category,
        input.importance,
        input.externalId ?? null,
        input.externalProvider ?? null,
        now,
        now
      )
      .run()
    return { ...input, id, createdAt: now, updatedAt: now }
  }

  async update(userId: string, id: string, patch: Partial<ScheduleEvent>): Promise<void> {
    const existing = await this.db.prepare('SELECT * FROM schedules WHERE id = ? AND user_id = ?').bind(id, userId).first<ScheduleRow>()
    if (!existing) throw new Error('일정을 찾을 수 없습니다')
    const merged = { ...rowToEvent(existing), ...patch }
    const now = new Date().toISOString()
    await this.db
      .prepare(
        `UPDATE schedules SET title=?, description=?, start_at=?, end_at=?, location=?, attendees=?, site_id=?, category=?, importance=?, updated_at=? WHERE id=? AND user_id=?`
      )
      .bind(
        merged.title,
        merged.description ?? null,
        merged.startAt,
        merged.endAt,
        merged.location ?? null,
        merged.attendees ? JSON.stringify(merged.attendees) : null,
        merged.siteId ?? null,
        merged.category,
        merged.importance,
        now,
        id,
        userId
      )
      .run()
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?').bind(id, userId).run()
  }
}
