import { NavLink, Outlet } from 'react-router-dom'
import { Users, Plug, Bot } from 'lucide-react'
import { cn } from '../../lib/cn'

const MENU = [
  { to: '/admin/users', label: '사용자 관리', icon: Users },
  { to: '/admin/integrations', label: 'API 연결 센터', icon: Plug },
  { to: '/admin/integrations/ai', label: 'LLM Provider', icon: Bot },
]

/** 관리자 패널 공통 레이아웃 - 서브메뉴 네비게이션 (기획 31~34번) */
export function AdminLayout() {
  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-slate-800">관리자 패널</h1>
      <div className="flex flex-col gap-4 md:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-48 md:flex-col">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.to === '/admin/integrations'}
              className={({ isActive }) =>
                cn('flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100')
              }
            >
              <m.icon size={15} /> {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
