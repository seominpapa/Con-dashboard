import { CheckSquare, Square } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import { api } from '../lib/api'
import type { WidgetProps } from '../../shared/types/widget'
import type { TodoItem } from '../../shared/types/todo'

const PRIORITY_TONE: Record<TodoItem['priority'], 'danger' | 'caution' | 'info' | 'normal'> = {
  urgent: 'danger',
  high: 'caution',
  normal: 'info',
  low: 'normal',
}

const PRIORITY_LABEL: Record<TodoItem['priority'], string> = {
  urgent: '긴급',
  high: '높음',
  normal: '보통',
  low: '낮음',
}

export function TodoWidget({}: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<TodoItem[]>('/api/todos', 0)

  const items = (data ?? [])
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const order: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
    })
    .slice(0, 6)

  async function toggleDone(t: TodoItem) {
    await api.patch(`/api/todos/${t.id}`, { status: 'done', completedAt: new Date().toISOString() })
    refresh()
  }

  return (
    <WidgetShell title="할일관리" icon={<CheckSquare size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh} detailPath="/todo">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <button onClick={() => toggleDone(t)} className="mt-0.5 text-slate-300 hover:text-emerald-500" aria-label="완료 처리">
                <Square size={14} />
              </button>
              <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{t.title}</p>
                {t.dueDate && <p className="text-[11px] text-slate-400">마감 {t.dueDate}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">할 일이 없습니다</p>
      )}
    </WidgetShell>
  )
}
