import type { ReactElement } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import type { WidgetProps } from '../../shared/types/widget'
import type { ExchangeRateItem, TrendDirection } from '../../shared/types/market'

const DIR_ICON: Record<TrendDirection, ReactElement> = {
  up: <TrendingUp size={12} className="text-red-500" />,
  down: <TrendingDown size={12} className="text-blue-500" />,
  flat: <Minus size={12} className="text-slate-400" />,
}

export function ExchangeRateWidget({}: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, asOf, refresh } = useWidgetData<ExchangeRateItem[]>('/api/exchange-rates', 45 * 60 * 1000)

  return (
    <WidgetShell title="환율" icon={<DollarSign size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} asOf={asOf} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.code} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{r.pairLabel}</span>
              <div className="flex items-center gap-1">
                <span className="tabular-nums font-semibold text-slate-800">{r.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span>
                {DIR_ICON[r.direction]}
                <span className={r.direction === 'up' ? 'text-red-500' : r.direction === 'down' ? 'text-blue-500' : 'text-slate-400'}>
                  {r.changeRate > 0 ? '+' : ''}{r.changeRate.toFixed(2)}%
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
