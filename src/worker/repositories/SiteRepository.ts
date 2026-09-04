import type { Site, SiteStatus } from '../../shared/types/site'
import { generateId } from '../auth/session'

interface SiteRow {
  id: string
  user_id: string
  name: string
  company: string | null
  address: string
  latitude: number
  longitude: number
  kma_nx: number
  kma_ny: number
  start_date: string | null
  end_date: string | null
  status: SiteStatus
  airkorea_station_name: string | null
}

function rowToSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    company: row.company ?? '',
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    kmaNx: row.kma_nx,
    kmaNy: row.kma_ny,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    status: row.status,
    airkoreaStationName: row.airkorea_station_name ?? undefined,
  }
}

export class SiteRepository {
  constructor(private db: D1Database) {}

  async listByUser(userId: string): Promise<Site[]> {
    const { results } = await this.db.prepare('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all<SiteRow>()
    return (results ?? []).map(rowToSite)
  }

  async findById(userId: string, id: string): Promise<Site | null> {
    const row = await this.db.prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?').bind(id, userId).first<SiteRow>()
    return row ? rowToSite(row) : null
  }

  async create(userId: string, input: Omit<Site, 'id'>): Promise<Site> {
    const id = generateId('site')
    await this.db
      .prepare(
        `INSERT INTO sites (id, user_id, name, company, address, latitude, longitude, kma_nx, kma_ny, start_date, end_date, status, airkorea_station_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, input.name, input.company ?? null, input.address, input.latitude, input.longitude, input.kmaNx, input.kmaNy, input.startDate ?? null, input.endDate ?? null, input.status, input.airkoreaStationName ?? null)
      .run()
    return { ...input, id }
  }

  async update(userId: string, id: string, patch: Partial<Site>): Promise<void> {
    const existing = await this.findById(userId, id)
    if (!existing) throw new Error('현장을 찾을 수 없습니다')
    const merged = { ...existing, ...patch }
    await this.db
      .prepare(
        `UPDATE sites SET name=?, company=?, address=?, latitude=?, longitude=?, kma_nx=?, kma_ny=?, start_date=?, end_date=?, status=?, airkorea_station_name=? WHERE id=? AND user_id=?`
      )
      .bind(merged.name, merged.company ?? null, merged.address, merged.latitude, merged.longitude, merged.kmaNx, merged.kmaNy, merged.startDate ?? null, merged.endDate ?? null, merged.status, merged.airkoreaStationName ?? null, id, userId)
      .run()
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.prepare('DELETE FROM sites WHERE id = ? AND user_id = ?').bind(id, userId).run()
  }
}
