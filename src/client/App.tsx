import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppLayout } from './components/layout/AppLayout'
import { Login } from './pages/Login'
import { PendingApproval } from './pages/PendingApproval'
import { Dashboard } from './pages/Dashboard'
import { SchedulePage } from './pages/SchedulePage'
import { TodoPage } from './pages/TodoPage'
import { BidsPage } from './pages/BidsPage'
import { NewsPage } from './pages/NewsPage'
import { SitesPage } from './pages/SitesPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminIntegrationsPage } from './pages/admin/AdminIntegrationsPage'
import { AdminAiIntegrationsPage } from './pages/admin/AdminAiIntegrationsPage'

function FullScreenLoader() {
  return <div className="flex h-screen items-center justify-center text-sm text-slate-400">불러오는 중...</div>
}

/**
 * 인증/승인 상태에 따른 라우팅 게이트 (기획 31번).
 * - 비로그인: 로그인 페이지만 접근 가능
 * - PENDING/REJECTED/SUSPENDED: 대기/안내 화면만 접근 가능 (다른 화면 절대 렌더링하지 않음)
 * - APPROVED: 정상 이용
 * 이 게이트는 UX 편의를 위한 것이며, 실제 데이터 보호는 서버 Middleware(requireApproved)가 담당한다.
 */
function Gate() {
  const { user, loading } = useAuth()

  if (loading) return <FullScreenLoader />

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  if (user.status !== 'APPROVED') {
    return (
      <Routes>
        <Route path="*" element={<PendingApproval />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/todo" element={<TodoPage />} />
        <Route path="/bids" element={<BidsPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/sites" element={<SitesPage />} />
        {user.role === 'ADMIN' && (
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="integrations" element={<AdminIntegrationsPage />} />
            <Route path="integrations/ai" element={<AdminAiIntegrationsPage />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
