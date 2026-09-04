/** 할일관리 도메인 모델 */
export type TodoPriority = 'urgent' | 'high' | 'normal' | 'low'
export type TodoStatus = 'todo' | 'in-progress' | 'done'

export interface TodoItem {
  id: string
  title: string
  description?: string
  /** ISO date (yyyy-MM-dd) */
  dueDate?: string
  priority: TodoPriority
  status: TodoStatus
  project?: string
  siteId?: string
  assignee?: string
  createdAt: string
  completedAt?: string | null
}

export const TODO_PRIORITY_LABEL: Record<TodoPriority, string> = {
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  low: '낮음',
}

export const TODO_STATUS_LABEL: Record<TodoStatus, string> = {
  todo: '할일',
  'in-progress': '진행중',
  done: '완료',
}

export const TODO_PRIORITY_ORDER: Record<TodoPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}
