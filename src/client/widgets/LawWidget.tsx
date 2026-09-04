import { Scale } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { LawItem } from '../../shared/types/law'

export function LawWidget({}: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<LawItem[]>('/api/laws', 12 * 60 * 60 * 1000)

  return (
    <WidgetShell title="법령·제도" icon={<Scale size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-slate-700">{l.name}</span>
              {l.changed ? <Badge tone="caution">개정</Badge> : <span className="text-[10px] text-slate-400">{l.lastAmendedDate}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
