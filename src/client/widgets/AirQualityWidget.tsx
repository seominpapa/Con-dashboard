import { Wind } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { AirQualityNow, AirQualityGrade } from '../../shared/types/air-quality'
import { AIR_QUALITY_GRADE_LABEL } from '../../shared/types/air-quality'

const GRADE_TONE: Record<AirQualityGrade, 'normal' | 'caution' | 'danger'> = {
  good: 'normal',
  moderate: 'caution',
  bad: 'danger',
  'very-bad': 'danger',
}

export function AirQualityWidget({ siteId }: WidgetProps) {
  const path = siteId ? `/api/air-quality?siteId=${siteId}&siteName=현장` : null
  const { data, loading, error, stale, isMock, updatedAt, asOf, refresh } = useWidgetData<AirQualityNow>(path, 30 * 60 * 1000)

  return (
    <WidgetShell title="대기질" icon={<Wind size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} asOf={asOf} onRefresh={refresh}>
      {data ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="col-span-2 space-y-0.5 text-slate-500">
            <p className="font-medium text-slate-700">{data.stationName} 측정소{data.stationDistanceKm !== undefined ? ` · 현장에서 ${data.stationDistanceKm.toFixed(1)} km` : ''}</p>
            <p>{data.stationAddress || '측정소 주소 정보 없음'}</p>
            {data.stationSelection === 'distance' && <p>좌표가 확인된 측정소 중 거리순 조회 · 가까운 5곳 이내</p>}
            {data.stationSelection === 'area' && <p>행정구역 기준 대체 조회 · 최근접 여부 미확인</p>}
            {data.stationSelection === 'configured' && <p>현장에 지정된 측정소</p>}
            <p>관측 {data.measuredAt}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">미세먼지 <span className="font-medium text-slate-700">{data.pm10} μg/m³</span></span>
            <Badge tone={GRADE_TONE[data.pm10Grade]}>{AIR_QUALITY_GRADE_LABEL[data.pm10Grade]}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">초미세먼지 <span className="font-medium text-slate-700">{data.pm25} μg/m³</span></span>
            <Badge tone={GRADE_TONE[data.pm25Grade]}>{AIR_QUALITY_GRADE_LABEL[data.pm25Grade]}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">오존 <span className="font-medium text-slate-700">{data.o3} ppm</span></span>
            <Badge tone={GRADE_TONE[data.o3Grade]}>{AIR_QUALITY_GRADE_LABEL[data.o3Grade]}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">통합지수(CAI) <span className="font-medium text-slate-700">{data.chai}</span></span>
            <Badge tone={GRADE_TONE[data.chaiGrade]}>{AIR_QUALITY_GRADE_LABEL[data.chaiGrade]}</Badge>
          </div>
        </div>
      ) : (
        <p role="status" className="text-xs text-slate-400">{loading ? '가까운 측정소의 대기질을 불러오는 중입니다…' : '데이터 없음'}</p>
      )}
    </WidgetShell>
  )
}
