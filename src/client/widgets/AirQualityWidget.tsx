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
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<AirQualityNow>(path, 30 * 60 * 1000)

  return (
    <WidgetShell title="대기질" icon={<Wind size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh}>
      {data ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">미세먼지</span>
            <Badge tone={GRADE_TONE[data.pm10Grade]}>{AIR_QUALITY_GRADE_LABEL[data.pm10Grade]}</Badge>
          </div>
          <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">초미세먼지</span>
            <Badge tone={GRADE_TONE[data.pm25Grade]}>{AIR_QUALITY_GRADE_LABEL[data.pm25Grade]}</Badge>
          </div>
          <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">오존</span>
            <Badge tone={GRADE_TONE[data.o3Grade]}>{AIR_QUALITY_GRADE_LABEL[data.o3Grade]}</Badge>
          </div>
          <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5">
            <span className="text-slate-500">통합지수</span>
            <Badge tone={GRADE_TONE[data.chaiGrade]}>{AIR_QUALITY_GRADE_LABEL[data.chaiGrade]}</Badge>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
