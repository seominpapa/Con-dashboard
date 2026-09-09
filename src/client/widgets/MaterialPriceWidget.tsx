import type { ReactElement } from 'react'
import { Package, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import type { WidgetProps } from '../../shared/types/widget'
import { MATERIAL_CATALOG } from '../../shared/types/market'
import type { MaterialPriceItem, TrendDirection } from '../../shared/types/market'

const DIR_ICON: Record<TrendDirection, ReactElement> = {
  up: <TrendingUp size={12} className="text-red-500" />,
  down: <TrendingDown size={12} className="text-blue-500" />,
  flat: <Minus size={12} className="text-slate-400" />,
}

/** 조달청 공공 기준가격과 명확히 표시된 Mock fallback을 보여준다. */
export function MaterialPriceWidget({ settings, onSettingsChange }: WidgetProps) {
  const configured = Array.isArray(settings.materialKeys)
    ? settings.materialKeys.filter((key): key is string => typeof key === 'string' && MATERIAL_CATALOG.some((item) => item.key === key))
    : []
  const materialKeys = configured.length ? configured.slice(0, 6) : MATERIAL_CATALOG.slice(0, 6).map((item) => item.key)
  const path = `/api/material-prices?keys=${encodeURIComponent(materialKeys.join(','))}`
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<MaterialPriceItem[]>(path, 6 * 60 * 60 * 1000)

  const toggleMaterial = (key: string) => {
    const next = materialKeys.includes(key) ? materialKeys.filter((item) => item !== key) : [...materialKeys, key].slice(0, 6)
    if (next.length) onSettingsChange({ ...settings, materialKeys: next })
  }

  return (
    <WidgetShell title="주요자재가격" icon={<Package size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {data.map((m) => (
              <li key={m.materialKey} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0">
                  <span className="font-medium text-slate-600">{m.label}</span>
                  {m.isMock && !isMock && <span className="ml-1 rounded bg-amber-50 px-1 text-[9px] font-medium text-amber-600">Mock</span>}
                  {m.spec && <span className="block truncate text-[10px] text-slate-400" title={m.spec}>{m.spec}</span>}
                </span>
                <div className="flex items-center gap-1">
                  <span className="tabular-nums font-semibold text-slate-800">
                    {m.price.toLocaleString('ko-KR')} <span className="text-[10px] text-slate-400">{m.unit}</span>
                  </span>
                  {m.hasTrend !== false && DIR_ICON[m.direction]}
                  {m.hasTrend !== false && (
                    <span className={m.direction === 'up' ? 'text-red-500' : m.direction === 'down' ? 'text-blue-500' : 'text-slate-400'}>
                      {m.changeRate > 0 ? '+' : ''}{m.changeRate.toFixed(1)}%
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className={`rounded px-2 py-1 text-[10px] ${isMock ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
            {isMock ? 'ⓘ 조달청 서비스 미승인 또는 조회 실패로 참고용 Mock 데이터입니다.'
              : data.some((m) => m.isMock) ? 'ⓘ 조달청 공공 기준가격(대표 규격)이며 시세·변동률이 아닙니다. Mock 표시 자재는 조달청이 제공하지 않는 항목입니다.'
              : 'ⓘ 조달청 공공 기준가격(대표 규격)이며 실시간 시세·변동률이 아닙니다.'}
          </p>
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer font-medium">표시 자재 선택 (최대 6개)</summary>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {MATERIAL_CATALOG.map((item) => (
                <label key={item.key} className="flex items-center gap-1" title={item.pps ? '조달청 기준가격 제공' : '조달청 미제공 (참고용 Mock)'}>
                  <input type="checkbox" checked={materialKeys.includes(item.key)} onChange={() => toggleMaterial(item.key)} />
                  {item.label}{!item.pps && <span className="text-[9px] text-amber-600">Mock</span>}
                </label>
              ))}
            </div>
          </details>
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
