import type { ReactElement } from 'react'
import { Package, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import type { WidgetProps } from '../../shared/types/widget'
import type { MaterialPriceItem, TrendDirection } from '../../shared/types/market'

const DIR_ICON: Record<TrendDirection, ReactElement> = {
  up: <TrendingUp size={12} className="text-red-500" />,
  down: <TrendingDown size={12} className="text-blue-500" />,
  flat: <Minus size={12} className="text-slate-400" />,
}

/**
 * 주요자재가격 - 기획 17번: 공식 상업용 API 확보 전까지 Mock 전용.
 * 서버가 항상 source:'mock' + message로 안내하지만, Widget 내부에도
 * 명시적 디스클레이머를 노출하여 사용자가 실거래가로 오인하지 않도록 한다.
 */
export function MaterialPriceWidget({}: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, refresh, } = useWidgetData<MaterialPriceItem[]>('/api/material-prices', 6 * 60 * 60 * 1000)

  return (
    <WidgetShell title="주요자재가격" icon={<Package size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {data.map((m) => (
              <li key={m.materialKey} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">{m.label}</span>
                <div className="flex items-center gap-1">
                  <span className="tabular-nums font-semibold text-slate-800">
                    {m.price.toLocaleString('ko-KR')} <span className="text-[10px] text-slate-400">{m.unit}</span>
                  </span>
                  {DIR_ICON[m.direction]}
                  <span className={m.direction === 'up' ? 'text-red-500' : m.direction === 'down' ? 'text-blue-500' : 'text-slate-400'}>
                    {m.changeRate > 0 ? '+' : ''}{m.changeRate.toFixed(1)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
            ⓘ 공식 상업용 자재가격 API 확보 전까지 참고용 Mock 데이터입니다. 실제 구매 시 별도 견적을 확인하세요.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
