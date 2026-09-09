interface MapInstance {
  setCenter(point: unknown): void
  autoResize(): void
  destroy(): void
}
interface TrafficLayer {
  setMap(map: MapInstance | null): void
  refreshRTSVersion(): void
  refresh(): void
  endAutoRefresh(): void
}
export interface NaverMaps {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance
  LatLng: new (latitude: number, longitude: number) => unknown
  Marker: new (options: Record<string, unknown>) => { setMap(map: MapInstance | null): void }
  TrafficLayer: new (options: { interval: number }) => TrafficLayer
}
type MapWindow = Window & { naver?: { maps: NaverMaps }; navermap_authFailure?: () => void; [key: string]: unknown }
export const MAP_AUTH_ERROR = 'naver-map-auth-error'
export const MAP_AUTH_MESSAGE = '지도 인증에 실패했습니다. Dynamic Map 선택, API Key ID, Web 서비스 URL과 이용 한도를 확인한 후 페이지를 새로고침하세요.'
let loading: Promise<NaverMaps> | null = null
let activeKey: string | null = null
let authFailed = false
let sequence = 0

export function loadNaverMaps(clientId: string): Promise<NaverMaps> {
  if (!/^[a-zA-Z0-9]{1,128}$/.test(clientId)) return Promise.reject(new Error('지도 API Key ID 형식이 올바르지 않습니다'))
  // ponytail: 페이지당 SDK/공개 ID 하나만 사용한다. 키 변경은 페이지 새로고침으로 적용한다.
  if (activeKey && activeKey !== clientId) return Promise.reject(new Error('지도 API Key ID가 변경되었습니다. 페이지를 새로고침하세요'))
  if (authFailed) return Promise.reject(new Error(MAP_AUTH_MESSAGE))
  if (loading) return loading
  activeKey = clientId
  const win = window as unknown as MapWindow
  loading = new Promise<NaverMaps>((resolve, reject) => {
    const script = document.createElement('script')
    const callback = `__dashboardMapReady${++sequence}`
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      delete win[callback]
      if (error) {
        script.remove()
        loading = null
        activeKey = null
        reject(error)
      } else resolve(win.naver!.maps)
    }
    const timer = setTimeout(() => finish(new Error('지도를 불러오지 못했습니다. 네트워크와 지도 설정을 확인하세요')), 15_000)
    win[callback] = () => finish(win.naver?.maps?.Map ? undefined : new Error('지도 SDK를 초기화하지 못했습니다'))
    win.navermap_authFailure = () => {
      authFailed = true
      finish(new Error(MAP_AUTH_MESSAGE))
      window.dispatchEvent(new Event(MAP_AUTH_ERROR))
    }
    script.async = true
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&callback=${callback}`
    script.onerror = () => finish(new Error('지도 SDK를 불러오지 못했습니다. 네트워크 연결을 확인하세요'))
    document.head.appendChild(script)
  })
  return loading
}

export function mountTrafficMap(element: HTMLElement, maps: NaverMaps, site: { name: string; latitude: number; longitude: number }) {
  const center = new maps.LatLng(site.latitude, site.longitude)
  const map = new maps.Map(element, { center, zoom: 14, zoomControl: true, scrollWheel: false })
  const marker = new maps.Marker({ position: center, map })
  const traffic = new maps.TrafficLayer({ interval: 300_000 })
  traffic.setMap(map)
  const resize = new ResizeObserver(() => map.autoResize())
  resize.observe(element)
  return {
    recenter: () => map.setCenter(center),
    refresh: () => { traffic.refreshRTSVersion(); traffic.refresh() },
    destroy: () => {
      resize.disconnect()
      traffic.endAutoRefresh()
      traffic.setMap(null)
      marker.setMap(null)
      map.destroy()
    },
  }
}
