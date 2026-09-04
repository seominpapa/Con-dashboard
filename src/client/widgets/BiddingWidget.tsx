import { Gavel } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { BidNotice } from '../../shared/types/bidding'

function daysLeft(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export function BiddingWidget({ instanceId }: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<BidNotice[]>('/api/bids?limit=6', 45 * 60 * 1000)

  return (
    <WidgetShell title="관심입찰" icon={<Gavel size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh} detailPath="/bids">
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((b) => {
            const left = daysLeft(b.deadlineDate)
            return (
              <li key={b.id} className="flex items-start gap-2">
                {left <= 3 ? <Badge tone="closing-soon">마감{left}일</Badge> : <Badge tone="new">신규</Badge>}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">{b.title}</p>
                  <p className="text-[11px] text-slate-400">{b.organization} · {b.region}</p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">등록된 관심 입찰이 없습니다</p>
      )}
    </WidgetShell>
  )
}
