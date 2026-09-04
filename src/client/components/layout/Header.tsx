import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HardHat, ChevronDown, LogOut, Settings, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSites } from '../../context/SiteContext'
import { cn } from '../../lib/cn'

/**
 * 상단 헤더: 현장 선택기, 사용자 메뉴(설정/관리자패널/로그아웃).
 * 기획 요구사항 중 "현재 선택 현장", "사용자 메뉴"를 담당한다.
 */
export function Header() {
  const { user, logout } = useAuth()
  const { sites, activeSiteId, setActiveSiteId } = useSites()
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
          <HardHat size={20} className="text-blue-600" />
          <span className="hidden sm:inline">건설 Dashboard</span>
        </Link>

        <div className="flex items-center gap-2">
          {sites.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setSiteMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <span className="max-w-[120px] truncate">{sites.find((s) => s.id === activeSiteId)?.name ?? '현장 선택'}</span>
                <ChevronDown size={14} />
              </button>
              {siteMenuOpen && (
                <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {sites.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveSiteId(s.id)
                        setSiteMenuOpen(false)
                      }}
                      className={cn(
                        'block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-slate-50',
                        s.id === activeSiteId ? 'font-semibold text-blue-600' : 'text-slate-600'
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                  <Link to="/sites" onClick={() => setSiteMenuOpen(false)} className="block border-t border-slate-100 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-50">
                    현장 관리
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-slate-200 p-1 pr-2 hover:bg-slate-50">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                  {user?.name?.slice(0, 1) ?? '?'}
                </span>
              )}
              <ChevronDown size={12} className="text-slate-400" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="truncate text-xs font-medium text-slate-700">{user?.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
                </div>
                <Link to="/sites" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  <Settings size={13} /> 현장 관리
                </Link>
                {user?.role === 'ADMIN' && (
                  <Link to="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                    <ShieldCheck size={13} /> 관리자 패널
                  </Link>
                )}
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
                >
                  <LogOut size={13} /> 로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
