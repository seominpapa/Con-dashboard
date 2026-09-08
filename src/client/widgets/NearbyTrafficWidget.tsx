import { CarFront, TriangleAlert } from 'lucide-react'
import type { NearbyTrafficSnapshot, TrafficStatus } from '../../shared/types/traffic'
import type { WidgetProps } from '../../shared/types/widget'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import { WidgetShell } from './WidgetShell'

const STATUS_TONE: Record<TrafficStatus, 'normal' | 'caution' | 'danger'> = {
  '원활': 'normal',
  '서행': 'caution',
  '정체': 'danger',
  '정보없음': 'caution',
}

export function NearbyTrafficWidget({ siteId }: WidgetProps) {
  const path = siteId ? `/api/traffic?siteId=${encodeURIComponent(siteId)}` : null
  const { data, loading, error, stale, updatedAt, refresh } = useWidgetData<NearbyTrafficSnapshot>(path, 5 * 60 * 1000)

  return (
    <WidgetShell title="인근 주요도로" icon={<CarFront size={16} />} loading={loading} error={error} stale={stale} updatedAt={updatedAt} onRefresh={refresh}>
      {data ? (
        <div className="space-y-3 text-xs">
          <div className="space-y-1.5">
            {data.roads.map((road, index) => (
              <div key={`${road.roadName}-${road.direction ?? ''}-${index}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5">
                <span className="min-w-0 truncate text-slate-600">{road.roadName}{road.direction ? ` · ${road.direction}` : ''}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <strong className="tabular-nums text-slate-800">{road.speedKph} km/h</strong>
                  {road.status !== '정보없음' && <Badge tone={STATUS_TONE[road.status]}>{road.status}</Badge>}
                </span>
              </div>
            ))}
            {data.roadsAvailable && data.roads.length === 0 && <p className="text-slate-400">인근 주요도로 소통정보가 없습니다.</p>}
            {!data.roadsAvailable && <p className="text-amber-600">도로 소통정보를 일시적으로 불러오지 못했습니다.</p>}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <p className="mb-1.5 flex items-center gap-1 font-medium text-slate-600"><TriangleAlert size={13} /> 사고·공사·통제</p>
            {data.incidents.map((incident, index) => (
              <p key={`${incident.title}-${index}`} className="mb-1 line-clamp-2 text-slate-500">{incident.roadName ? `[${incident.roadName}] ` : ''}{incident.title}</p>
            ))}
            {data.incidentsAvailable && data.incidents.length === 0 && <p className="text-slate-400">현재 표시할 돌발정보가 없습니다.</p>}
            {!data.incidentsAvailable && <p className="text-amber-600">돌발정보를 일시적으로 불러오지 못했습니다.</p>}
          </div>
        </div>
      ) : <p className="text-xs text-slate-400">데이터 없음</p>}
    </WidgetShell>
  )
}
