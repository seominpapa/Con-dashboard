import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { ApiEnvelope } from '../../shared/types/common'

interface UseWidgetDataResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  stale: boolean
  isMock: boolean
  updatedAt: string | null
  /** 자료 기준 시점 (고시일·관측시각 등) */
  asOf: string | null
  refresh: () => void
}

/**
 * Widget 공통 데이터 조회 훅.
 * - refreshInterval > 0 이면 자동 polling
 * - API 실패 시에도 마지막으로 성공했던 data를 유지하고 error 메시지만 세팅한다
 *   (기획 22번: "마지막 정상 데이터" 유지 + stale 표시)
 */
export function useWidgetData<T>(path: string | null, refreshInterval = 0): UseWidgetDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)
  const hasDataRef = useRef(false)

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false)
      setError('현장을 선택해주세요')
      return
    }
    setLoading(true)
    const res: ApiEnvelope<T> = await api.get<T>(path)
    setLoading(false)
    if (res.status === 'success' && res.data !== null) {
      setData(res.data)
      hasDataRef.current = true
      setError(null)
      setStale(Boolean(res.stale))
      setIsMock(res.source === 'mock')
      setUpdatedAt(res.updatedAt)
      setAsOf(res.asOf ?? null)
    } else {
      // 실패했지만 이전에 받아둔 데이터가 있으면 그대로 유지하고 stale 처리
      setError(res.message ?? '데이터를 불러올 수 없습니다')
      if (hasDataRef.current) setStale(true)
    }
  }, [path])

  useEffect(() => {
    load()
    if (!refreshInterval) return
    const timer = setInterval(load, refreshInterval)
    return () => clearInterval(timer)
  }, [load, refreshInterval])

  return { data, loading, error: hasDataRef.current ? null : error, stale, isMock, updatedAt, asOf, refresh: load }
}
