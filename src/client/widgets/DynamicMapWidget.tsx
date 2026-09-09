import { useEffect, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'
import type { WidgetProps } from '../../shared/types/widget'
import { api } from '../lib/api'
import { loadNaverMaps, mountTrafficMap, MAP_AUTH_ERROR, MAP_AUTH_MESSAGE } from '../lib/naverMap'
import { WidgetShell } from './WidgetShell'

interface MapConfig {
  clientId: string
  site: { id: string; name: string; latitude: number; longitude: number }
}

export function DynamicMapWidget({ siteId }: WidgetProps) {
  // 현장이 바뀌면 이전 현장의 지도와 비동기 요청을 함께 폐기한다.
  return <SiteMap key={siteId} siteId={siteId} />
}

function SiteMap({ siteId }: { siteId: string }) {
  const container = useRef<HTMLDivElement>(null)
  const controller = useRef<ReturnType<typeof mountTrafficMap> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    let failed = false
    const fail = (message: string) => {
      if (cancelled) return
      failed = true
      controller.current?.destroy()
      controller.current = null
      setError(message)
      setLoading(false)
    }
    const authError = () => fail(MAP_AUTH_MESSAGE)
    window.addEventListener(MAP_AUTH_ERROR, authError)
    setLoading(true)
    setError(null)
    async function initialize() {
      if (!siteId) return fail('현장을 선택해 주세요')
      const response = await api.get<MapConfig>(`/api/naver-map?siteId=${encodeURIComponent(siteId)}`)
      if (cancelled || failed) return
      if (response.status !== 'success' || !response.data) return fail(response.message ?? '지도 설정을 불러오지 못했습니다')
      try {
        const { clientId, site } = response.data
        const maps = await loadNaverMaps(clientId)
        if (cancelled || failed || !container.current) return
        const mounted = mountTrafficMap(container.current, maps, site)
        if (cancelled || failed) { mounted.destroy(); return }
        controller.current = mounted
        setSiteName(site.name)
        setLoading(false)
      } catch {
        fail('지도를 표시하지 못했습니다. 관리자 패널의 Dynamic Map ID, 네이버 콘솔의 Dynamic Map 선택·Web 서비스 URL·이용 한도를 확인하고 페이지를 새로고침하세요.')
      }
    }
    void initialize()
    return () => {
      cancelled = true
      window.removeEventListener(MAP_AUTH_ERROR, authError)
      controller.current?.destroy()
      controller.current = null
    }
  }, [siteId, attempt])

  function refresh() {
    if (loading) return
    if (!controller.current) { setAttempt((value) => value + 1); return }
    controller.current.refresh()
    setNotice('교통정보 갱신을 요청했습니다. 도로별 수집 시각은 다를 수 있습니다.')
  }

  return (
    <WidgetShell title="현장 교통지도" icon={<MapPinned size={16} />} loading={loading} onRefresh={refresh}>
      <div className="space-y-2 text-xs" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        {error && <p role="alert" className="rounded bg-amber-50 p-2 text-amber-800">{error}</p>}
        {loading && <p role="status" className="text-slate-500">지도를 불러오는 중...</p>}
        <div ref={container} role="region" aria-label={`${siteName || '현장'} 교통지도`} className="h-80 w-full cursor-auto rounded bg-slate-50" style={{ display: error ? 'none' : undefined, touchAction: 'auto' }} />
        {!error && !loading && <>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{siteName} · 현장 마커</p>
            <button className="shrink-0 rounded border border-slate-200 px-2 py-1 text-blue-600 hover:bg-slate-50" onClick={() => controller.current?.recenter()}>현장으로</button>
          </div>
          <p className="text-slate-500">네이버 교통정보 · 5분 간격 자동 갱신 · 색상이 없는 도로는 정보가 없을 수 있습니다.</p>
          {notice && <p role="status" className="text-slate-500">{notice}</p>}
        </>}
      </div>
    </WidgetShell>
  )
}
