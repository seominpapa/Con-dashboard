import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { SiteProvider } from '../../context/SiteContext'

/** APPROVED 사용자에게만 노출되는 공통 레이아웃 (헤더 + 하단 모바일 네비 + 컨텐츠) */
export function AppLayout() {
  return (
    <SiteProvider>
      <div className="min-h-screen pb-16 md:pb-0">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </SiteProvider>
  )
}
