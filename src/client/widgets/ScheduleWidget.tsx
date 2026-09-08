import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { getLocalDayKey } from '../lib/localDate'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { ScheduleEvent } from '../../shared/types/schedule'
import { SCHEDULE_CATEGORY_LABEL } from '../../shared/types/schedule'

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return `오늘 ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
}

export { getLocalDayKey } from '../lib/localDate'

export function ScheduleWidget({}: WidgetProps) {
  const dayKey = getLocalDayKey(new Date())
  const { from, to } = useMemo(() => {
    const now = new Date()
    return {
      from: now.toISOString(),
      to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
  }, [dayKey])
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<ScheduleEvent[]>(
    `/api/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    0
  )

  const items = (data ?? []).slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()).slice(0, 6)

  return (
    <WidgetShell title="일정관리" icon={<Calendar size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh} detailPath="/schedule">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="flex items-start gap-2">
              {s.importance === 'high' ? <Badge tone="danger">중요</Badge> : <Badge tone="info">{SCHEDULE_CATEGORY_LABEL[s.category]}</Badge>}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{s.title}</p>
                <p className="text-[11px] text-slate-400">{formatDate(s.startAt)}{s.location ? ` · ${s.location}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">등록된 일정이 없습니다</p>
      )}
    </WidgetShell>
  )
}
