import { NavLink } from 'react-router-dom'
import { LayoutGrid, Calendar, CheckSquare, Gavel, Newspaper } from 'lucide-react'
import { cn } from '../../lib/cn'

const ITEMS = [
  { to: '/', label: '홈', icon: LayoutGrid },
  { to: '/schedule', label: '일정', icon: Calendar },
  { to: '/todo', label: '할일', icon: CheckSquare },
  { to: '/bids', label: '입찰', icon: Gavel },
  { to: '/news', label: '뉴스', icon: Newspaper },
]

/** 모바일 하단 네비게이션 (기획 24번: 모바일 UX) */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white md:hidden" aria-label="하단 내비게이션">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', isActive ? 'text-blue-600' : 'text-slate-400')
          }
        >
          <item.icon size={18} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
