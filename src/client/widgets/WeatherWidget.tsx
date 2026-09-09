import { CloudSun } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { WeatherNow, ConstructionWeatherRisk } from '../../shared/types/weather'

interface WeatherResponse {
  weather: WeatherNow
  risk: ConstructionWeatherRisk
}

export function WeatherWidget({ siteId }: WidgetProps) {
  const path = siteId ? `/api/weather?siteId=${siteId}&nx=60&ny=127&siteName=현장` : null
  const { data, loading, error, stale, isMock, updatedAt, asOf, refresh } = useWidgetData<WeatherResponse>(path, 15 * 60 * 1000)

  return (
    <WidgetShell title="건설날씨" icon={<CloudSun size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} asOf={asOf} onRefresh={refresh}>
      {data ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-slate-900">{Math.round(data.weather.temperature)}°</span>
              <span className="ml-1 text-xs text-slate-400">
                {data.weather.minTemperature}° / {data.weather.maxTemperature}°
              </span>
            </div>
            <span className="text-xs text-slate-500">{data.weather.skyLabel}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
            <div>
              강수 {data.weather.precipitationProbability}%
            </div>
            <div>풍속 {data.weather.windSpeed}m/s</div>
            <div>습도 {data.weather.humidity}%</div>
          </div>
          {data.risk.items.filter((i) => i.level !== 'normal').length > 0 && (
            <div className="space-y-1 border-t border-slate-100 pt-2">
              {data.risk.items
                .filter((i) => i.level !== 'normal')
                .slice(0, 3)
                .map((item) => (
                  <div key={item.workType} className="flex items-start gap-1.5 text-xs">
                    <Badge tone={item.level === 'danger' ? 'danger' : 'caution'}>{item.workTypeLabel}</Badge>
                    <span className="text-slate-500">{item.reasons[0]}</span>
                  </div>
                ))}
              <p className="pt-1 text-[10px] text-slate-400">{data.risk.disclaimer}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
