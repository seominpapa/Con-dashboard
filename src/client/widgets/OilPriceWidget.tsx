import type { ReactElement } from 'react'
import { Fuel, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import type { WidgetProps } from '../../shared/types/widget'
import type { OilPriceItem, TrendDirection } from '../../shared/types/market'

const DIR_ICON: Record<TrendDirection, ReactElement> = {
  up: <TrendingUp size={12} className="text-red-500" />,
  down: <TrendingDown size={12} className="text-blue-500" />,
  flat: <Minus size={12} className="text-slate-400" />,
}

export function OilPriceWidget({}: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<OilPriceItem[]>('/api/oil-prices', 45 * 60 * 1000)

  return (
    <WidgetShell title="유가" icon={<Fuel size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((o) => (
            <li key={o.kind} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{o.label}</span>
              <div className="flex items-center gap-1">
                <span className="tabular-nums font-semibold text-slate-800">
                  {o.price.toLocaleString('ko-KR')} <span className="text-[10px] text-slate-400">{o.unit}</span>
                </span>
                {DIR_ICON[o.direction]}
                <span className={o.direction === 'up' ? 'text-red-500' : o.direction === 'down' ? 'text-blue-500' : 'text-slate-400'}>
                  {o.weeklyChangeRate > 0 ? '+' : ''}{o.weeklyChangeRate.toFixed(1)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
