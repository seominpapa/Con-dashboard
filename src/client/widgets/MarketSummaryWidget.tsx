import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { LineChart, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { WidgetShell, formatAsOf } from './WidgetShell'
import { api } from '../lib/api'
import type { WidgetProps } from '../../shared/types/widget'
import { MATERIAL_CATALOG } from '../../shared/types/market'
import type { ExchangeRateItem, MaterialPriceItem, TrendDirection } from '../../shared/types/market'

interface SummaryIndicator {
  key: string
  label: string
  displayValue: string
  changeRate: number
  direction: TrendDirection
  hasTrend: boolean
  source?: string
  producerPriceIndex?: MaterialPriceItem['producerPriceIndex']
}

const DIR_ICON: Record<TrendDirection, ReactElement> = {
  up: <TrendingUp size={12} className="text-red-500" />,
  down: <TrendingDown size={12} className="text-blue-500" />,
  flat: <Minus size={12} className="text-slate-400" />,
}

/**
 * 건설시장 종합 - 환율/조달청 기준가격/ECOS 생산자물가지수를 조합해 보여준다.
 * 별도 서버 라우트를 만들지 않고 기존 위젯 API를 재사용한다.
 * 자재가격 연동 실패 시 Mock 소스를 포함할 수 있어 mockBadge로 안내한다.
 */
export function MarketSummaryWidget({ settings, onSettingsChange }: WidgetProps) {
  const [indicators, setIndicators] = useState<SummaryIndicator[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [basis, setBasis] = useState<string | null>(null)
  const hasDataRef = useRef(false)
  const configured = Array.isArray(settings.materialKeys)
    ? settings.materialKeys.filter((key): key is string => typeof key === 'string' && MATERIAL_CATALOG.some((item) => item.key === key))
    : []
  const materialKeys = configured.length ? configured.slice(0, 6) : MATERIAL_CATALOG.slice(0, 6).map((item) => item.key)
  const materialQuery = materialKeys.join(',')

  const load = useCallback(async () => {
    setLoading(true)
    const [ex, mat] = await Promise.all([
      api.get<ExchangeRateItem[]>('/api/exchange-rates?codes=USD'),
      api.get<MaterialPriceItem[]>(`/api/material-prices?keys=${encodeURIComponent(materialQuery)}`),
    ])
    setLoading(false)

    const failed = ex.status !== 'success' && mat.status !== 'success'
    if (failed) {
      setError('시장 지표를 불러올 수 없습니다')
      if (hasDataRef.current) setStale(true)
      return
    }

    const next: SummaryIndicator[] = []
    const usd = ex.data?.[0]
    if (usd) next.push({ key: 'usd', label: '원/달러', displayValue: `${usd.rate.toLocaleString('ko-KR')}원`, changeRate: usd.changeRate, direction: usd.direction, hasTrend: true })
    for (const material of mat.data ?? []) {
      next.push({
        key: material.materialKey,
        label: material.label,
        displayValue: `${material.price.toLocaleString('ko-KR')}/${material.unit}`,
        changeRate: material.changeRate,
        direction: material.direction,
        hasTrend: material.hasTrend !== false,
        source: material.isMock ? '참고용 Mock' : '조달청 기준가격',
        producerPriceIndex: material.producerPriceIndex,
      })
    }

    setIndicators(next)
    hasDataRef.current = true
    setError(null)
    setStale(false)
    setIsMock([ex.source, mat.source].includes('mock') || (mat.data ?? []).some((material) => material.isMock))
    setUpdatedAt(new Date().toISOString())
    setBasis([ex.asOf && `환율 ${formatAsOf(ex.asOf)}`, mat.asOf && `자재 고시 ${formatAsOf(mat.asOf)}`].filter(Boolean).join(' · ') || null)
  }, [materialQuery])

  const toggleMaterial = (key: string) => {
    const next = materialKeys.includes(key) ? materialKeys.filter((item) => item !== key) : [...materialKeys, key].slice(0, 6)
    if (next.length) onSettingsChange({ ...settings, materialKeys: next })
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 45 * 60 * 1000)
    return () => clearInterval(timer)
  }, [load])

  return (
    <WidgetShell
      title="건설시장 종합"
      icon={<LineChart size={16} />}
      loading={loading}
      error={hasDataRef.current ? null : error}
      stale={stale}
      mockBadge={isMock}
      updatedAt={updatedAt}
      asOf={basis}
      onRefresh={load}
    >
      {indicators && indicators.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {indicators.map((i) => (
            <div key={i.key} className="rounded bg-slate-50 px-2 py-1.5">
              <p className="text-[11px] text-slate-500">{i.label}</p>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-xs font-semibold text-slate-800">{i.displayValue}</span>
                {i.hasTrend && DIR_ICON[i.direction]}
              </div>
              {i.hasTrend && (
                <span className={`text-[10px] ${i.direction === 'up' ? 'text-red-500' : i.direction === 'down' ? 'text-blue-500' : 'text-slate-400'}`}>
                  {i.changeRate > 0 ? '+' : ''}{i.changeRate.toFixed(1)}%
                </span>
              )}
              {i.source && <p className="mt-1 text-[9px] text-slate-400">{i.source}</p>}
              {i.producerPriceIndex && (
                <p className="mt-0.5 text-[9px] text-slate-500">
                  ECOS 지수 {i.producerPriceIndex.value.toFixed(1)} · 전월 {i.producerPriceIndex.changeRate > 0 ? '+' : ''}{i.producerPriceIndex.changeRate.toFixed(2)}% ({i.producerPriceIndex.asOf})
                </p>
              )}
            </div>
          ))}
          <details className="col-span-2 text-[11px] text-slate-500">
            <summary className="cursor-pointer font-medium">종합지표 자재 선택 (최대 6개)</summary>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {MATERIAL_CATALOG.map((item) => (
                <label key={item.key} className="flex items-center gap-1">
                  <input type="checkbox" checked={materialKeys.includes(item.key)} onChange={() => toggleMaterial(item.key)} />
                  {item.label}
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-[10px]">
              <a className="text-blue-600 hover:underline" href="https://www.data.go.kr/data/15129415/openapi.do" target="_blank" rel="noreferrer">조달청 기준가격 원문</a>
              <a className="text-blue-600 hover:underline" href="https://ecos.bok.or.kr/api/" target="_blank" rel="noreferrer">ECOS 지수 원문</a>
            </div>
          </details>
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
