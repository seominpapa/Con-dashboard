import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { createDefaultConfig, dashboardRepository, syncDashboardConfigToServer } from '../lib/dashboardRepository'
import type { Site } from '../../shared/types/site'

interface SiteContextValue {
  sites: Site[]
  activeSiteId: string | null
  activeSite: Site | null
  loading: boolean
  setActiveSiteId: (id: string) => void
  refetch: () => Promise<void>
}

const SiteContext = createContext<SiteContextValue | null>(null)

/**
 * 다중 현장(Site) 관리 (기획 18번). 로그인 사용자가 여러 현장을 등록해두고
 * 대시보드 상단에서 전환할 수 있으며, 현재 선택된 현장 ID는 현장환경 계열
 * Widget(건설날씨/대기질/오늘의현장 등)에 siteId로 전달된다.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<Site[]>([])
  const [activeSiteId, setActiveSiteIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const res = await api.get<Site[]>('/api/sites')
    const list = res.status === 'success' && res.data ? res.data : []
    setSites(list)
    setLoading(false)
    return
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    if (sites.length === 0) {
      setActiveSiteIdState(null)
      return
    }
    const config = dashboardRepository.load() ?? createDefaultConfig()
    const saved = config.activeSiteId
    const valid = saved && sites.some((s) => s.id === saved)
    const nextId = valid ? saved! : sites[0].id
    setActiveSiteIdState(nextId)
    const next = { ...config, activeSiteId: nextId }
    dashboardRepository.save(next)
    syncDashboardConfigToServer(next)
  }, [sites])

  const setActiveSiteId = useCallback((id: string) => {
    setActiveSiteIdState(id)
    const config = dashboardRepository.load() ?? createDefaultConfig()
    const next = { ...config, activeSiteId: id }
    dashboardRepository.save(next)
    syncDashboardConfigToServer(next)
  }, [])

  const activeSite = sites.find((s) => s.id === activeSiteId) ?? null

  return (
    <SiteContext.Provider value={{ sites, activeSiteId, activeSite, loading, setActiveSiteId, refetch }}>{children}</SiteContext.Provider>
  )
}

export function useSites() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSites는 SiteProvider 내부에서만 사용할 수 있습니다')
  return ctx
}
