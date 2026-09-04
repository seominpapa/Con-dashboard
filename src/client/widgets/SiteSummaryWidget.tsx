import { HardHat } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { SiteSummaryToday } from '../../shared/types/site-summary'

export function SiteSummaryWidget({ siteId }: WidgetProps) {
  const path = siteId ? `/api/site-summary?siteId=${siteId}&siteName=현장` : null
  const { data, loading, error, stale, updatedAt, refresh } = useWidgetData<SiteSummaryToday>(path, 10 * 60 * 1000)

  return (
    <WidgetShell title="오늘의 현장" icon={<HardHat size={16} />} loading={loading} error={error} stale={stale} updatedAt={updatedAt} onRefresh={refresh}>
      {data ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1 text-center text-xs">
            <div>
              <p className="font-semibold text-slate-800">{data.workerCount}</p>
              <p className="text-[10px] text-slate-400">투입인원</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">{data.workTypeCount}</p>
              <p className="text-[10px] text-slate-400">작업종류</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">{data.equipmentCount}</p>
              <p className="text-[10px] text-slate-400">장비</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">{data.riskWorkCount}</p>
              <p className="text-[10px] text-slate-400">위험작업</p>
            </div>
          </div>
          {data.issues.length > 0 && (
            <ul className="space-y-1 border-t border-slate-100 pt-2">
              {data.issues.slice(0, 3).map((issue) => (
                <li key={issue.id} className="flex items-start gap-1.5 text-xs">
                  <Badge tone={issue.severity === 'critical' ? 'danger' : issue.severity === 'warning' ? 'caution' : 'info'}>
                    {issue.severity === 'critical' ? '위험' : issue.severity === 'warning' ? '주의' : '정보'}
                  </Badge>
                  <span className="text-slate-600">{issue.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
