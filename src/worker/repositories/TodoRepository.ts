import type { TodoItem, TodoPriority, TodoStatus } from '../../shared/types/todo'
import { generateId } from '../auth/session'

interface TodoRow {
  id: string
  user_id: string
  title: string
  description: string | null
  due_date: string | null
  priority: TodoPriority
  status: TodoStatus
  project: string | null
  site_id: string | null
  assignee: string | null
  created_at: string
  completed_at: string | null
}

function rowToTodo(row: TodoRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    dueDate: row.due_date ?? undefined,
    priority: row.priority,
    status: row.status,
    project: row.project ?? undefined,
    siteId: row.site_id ?? undefined,
    assignee: row.assignee ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

export class TodoRepository {
  constructor(private db: D1Database) {}

  async listByUser(userId: string): Promise<TodoItem[]> {
    const { results } = await this.db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY due_date ASC').bind(userId).all<TodoRow>()
    return (results ?? []).map(rowToTodo)
  }

  async create(userId: string, input: Omit<TodoItem, 'id' | 'createdAt' | 'completedAt'>): Promise<TodoItem> {
    const id = generateId('todo')
    const now = new Date().toISOString()
    await this.db
      .prepare(
        `INSERT INTO todos (id, user_id, title, description, due_date, priority, status, project, site_id, assignee, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, input.title, input.description ?? null, input.dueDate ?? null, input.priority, input.status, input.project ?? null, input.siteId ?? null, input.assignee ?? null, now, null)
      .run()
    return { ...input, id, createdAt: now, completedAt: null }
  }

  async update(userId: string, id: string, patch: Partial<TodoItem>): Promise<void> {
    const existing = await this.db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').bind(id, userId).first<TodoRow>()
    if (!existing) throw new Error('할일을 찾을 수 없습니다')
    const merged = { ...rowToTodo(existing), ...patch }
    const completedAt = merged.status === 'done' ? merged.completedAt ?? new Date().toISOString() : null
    await this.db
      .prepare(
        `UPDATE todos SET title=?, description=?, due_date=?, priority=?, status=?, project=?, site_id=?, assignee=?, completed_at=? WHERE id=? AND user_id=?`
      )
      .bind(merged.title, merged.description ?? null, merged.dueDate ?? null, merged.priority, merged.status, merged.project ?? null, merged.siteId ?? null, merged.assignee ?? null, completedAt, id, userId)
      .run()
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').bind(id, userId).run()
  }
}
