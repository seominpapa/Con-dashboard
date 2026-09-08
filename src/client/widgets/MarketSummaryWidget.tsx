import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { LineChart, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { api } from '../lib/api'
import type { WidgetProps } from '../../shared/types/widget'
import type { ExchangeRateItem, MaterialPriceItem, TrendDirection } from '../../shared/types/market'

interface SummaryIndicator {
  key: string
  label: string
  displayValue: string
  changeRate: number
  direction: TrendDirection
}

const DIR_ICON: Record<TrendDirection, ReactElement> = {
  up: <TrendingUp size={12} className="text-red-500" />,
  down: <TrendingDown size={12} className="text-blue-500" />,
  flat: <Minus size={12} className="text-slate-400" />,
}

/**
 * 건설시장 종합 - 환율/자재가격 API 응답을 조합해 핵심 지표만 뽑아 보여준다.
 * 별도 서버 라우트를 만들지 않고 기존 위젯 API를 재사용한다.
 * (자재가격은 항상 Mock이므로 최종 결과도 부분적으로 mock 소스를 포함할 수 있다 -> mockBadge로 안내)
 */
export function MarketSummaryWidget({}: WidgetProps) {
  const [indicators, setIndicators] = useState<SummaryIndicator[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const hasDataRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [ex, mat] = await Promise.all([
      api.get<ExchangeRateItem[]>('/api/exchange-rates?codes=USD'),
      api.get<MaterialPriceItem[]>('/api/material-prices?keys=rebar,cement'),
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
    if (usd) next.push({ key: 'usd', label: '원/달러', displayValue: `${usd.rate.toLocaleString('ko-KR')}원`, changeRate: usd.changeRate, direction: usd.direction })
    const rebar = mat.data?.find((m) => m.materialKey === 'rebar')
    if (rebar) next.push({ key: 'rebar', label: '철근', displayValue: `${rebar.price.toLocaleString('ko-KR')}/${rebar.unit}`, changeRate: rebar.changeRate, direction: rebar.direction })
    const cement = mat.data?.find((m) => m.materialKey === 'cement')
    if (cement) next.push({ key: 'cement', label: '시멘트', displayValue: `${cement.price.toLocaleString('ko-KR')}/${cement.unit}`, changeRate: cement.changeRate, direction: cement.direction })

    setIndicators(next)
    hasDataRef.current = true
    setError(null)
    setStale(false)
    setIsMock([ex.source, mat.source].includes('mock'))
    setUpdatedAt(new Date().toISOString())
  }, [])

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
      onRefresh={load}
    >
      {indicators && indicators.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {indicators.map((i) => (
            <div key={i.key} className="rounded bg-slate-50 px-2 py-1.5">
              <p className="text-[11px] text-slate-500">{i.label}</p>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-xs font-semibold text-slate-800">{i.displayValue}</span>
                {DIR_ICON[i.direction]}
              </div>
              <span className={`text-[10px] ${i.direction === 'up' ? 'text-red-500' : i.direction === 'down' ? 'text-blue-500' : 'text-slate-400'}`}>
                {i.changeRate > 0 ? '+' : ''}{i.changeRate.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
