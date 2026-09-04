import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { PublicUser } from '../../shared/types/user'

interface AuthContextValue {
  user: PublicUser | null
  loading: boolean
  googleEnabled: boolean
  refetch: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleEnabled, setGoogleEnabled] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [meRes, configRes] = await Promise.all([api.get<PublicUser | null>('/api/auth/me'), api.get<{ googleEnabled: boolean }>('/api/auth/config')])
    setUser(meRes.status === 'success' ? meRes.data ?? null : null)
    if (configRes.status === 'success' && configRes.data) setGoogleEnabled(configRes.data.googleEnabled)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout')
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, googleEnabled, refetch, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다')
  return ctx
}
