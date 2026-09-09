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

const STATUS_VISUAL: Record<TrafficStatus, string> = {
  '원활': 'bg-emerald-500',
  '서행': 'bg-amber-400',
  '정체': 'bg-red-500',
  '정보없음': 'bg-slate-400',
}

export function NearbyTrafficWidget({ siteId }: WidgetProps) {
  const path = siteId ? `/api/traffic?siteId=${encodeURIComponent(siteId)}` : null
  const { data, loading, error, stale, updatedAt, asOf, refresh } = useWidgetData<NearbyTrafficSnapshot>(path, 5 * 60 * 1000)
  const congestedRoads = data?.roads.filter((road) => road.status === '정체') ?? []

  return (
    <WidgetShell title="인근 주요도로" icon={<CarFront size={16} />} loading={loading} error={error} stale={stale} updatedAt={updatedAt} asOf={asOf} onRefresh={refresh}>
      {data ? (
        <div className="space-y-3 text-xs">
          <div className="space-y-1.5">
            {congestedRoads.length > 0 && (
              <p className="rounded bg-red-50 px-2 py-1.5 font-medium text-red-700">
                정체 구간 {congestedRoads.length}곳 · {congestedRoads.map((road) => road.roadName).join(', ')}
              </p>
            )}
            {data.roads.map((road, index) => (
              <div key={`${road.roadName}-${road.direction ?? ''}-${index}`} className="rounded bg-slate-50 px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-slate-600">{road.roadName}{road.direction ? ` · ${road.direction}` : ''}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <strong className="tabular-nums text-slate-800">{road.speedKph} km/h</strong>
                    <Badge tone={STATUS_TONE[road.status]}>{road.statusSource === 'speed' ? `속도기준 ${road.status}` : road.status}</Badge>
                  </span>
                </div>
                <div role="img" aria-label={`${road.roadName} ${road.statusSource === 'speed' ? '속도기준 ' : ''}${road.status}, 시속 ${road.speedKph}킬로미터`} className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${STATUS_VISUAL[road.status]}`} style={{ width: `${Math.min(100, Math.max(4, road.speedKph / 80 * 100))}%` }} />
                </div>
              </div>
            ))}
            {data.roadsAvailable && data.roads.length === 0 && <p className="text-slate-400">인근 주요도로 소통정보가 없습니다.</p>}
            {!data.roadsAvailable && <p className="text-amber-600">도로 소통정보를 일시적으로 불러오지 못했습니다.</p>}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <p className="mb-1.5 flex items-center gap-1 font-medium text-slate-600"><TriangleAlert size={13} /> 사고·공사·통제</p>
            {data.incidents.map((incident, index) => (
              <article key={`${incident.title}-${index}`} aria-label={`${incident.type} ${incident.title}`} className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                <p className="font-medium"><span className="mr-1 text-amber-700">{incident.type}</span>{incident.roadName ? `[${incident.roadName}] ` : ''}{incident.title}</p>
                {incident.description && <p className="mt-0.5 line-clamp-2 text-amber-800">{incident.description}</p>}
              </article>
            ))}
            {data.incidentsAvailable && data.incidents.length === 0 && <p className="text-slate-400">현재 표시할 돌발정보가 없습니다.</p>}
            {!data.incidentsAvailable && <p className="text-amber-600">돌발정보를 일시적으로 불러오지 못했습니다.</p>}
          </div>
        </div>
      ) : <p className="text-xs text-slate-400">데이터 없음</p>}
    </WidgetShell>
  )
}
