import { AlertOctagon } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { WeatherAlert } from '../../shared/types/weather'

export function WeatherAlertWidget({ siteId }: WidgetProps) {
  const path = siteId ? `/api/weather/alerts?siteId=${siteId}&nx=60&ny=127&address=현장` : null
  const { data, loading, error, stale, isMock, updatedAt, asOf, refresh } = useWidgetData<WeatherAlert[]>(path, 7 * 60 * 1000)

  return (
    <WidgetShell title="기상·재난특보" icon={<AlertOctagon size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} asOf={asOf} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <Badge tone={a.level === '경보' ? 'danger' : 'caution'}>{a.kind}{a.level}</Badge>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">{a.title}</p>
                <p className="text-[11px] text-slate-400">{a.region}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">발효 중인 특보가 없습니다</p>
      )}
    </WidgetShell>
  )
}
