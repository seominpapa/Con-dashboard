import { useEffect, useState } from 'react'
import { Check, X, ShieldOff, RotateCcw, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import type { PublicUser, UserStatus } from '../../../shared/types/user'
import { cn } from '../../lib/cn'

const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: '승인대기',
  APPROVED: '승인됨',
  REJECTED: '거절됨',
  SUSPENDED: '정지됨',
}

const STATUS_TONE: Record<UserStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  SUSPENDED: 'bg-slate-100 text-slate-500',
}

/** 사용자 관리 - 승인 대기 목록 + 전체 사용자 관리 (기획 31~32번) */
export function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<PublicUser | null>(null)

  async function load() {
    setLoading(true)
    const [usersRes, meRes] = await Promise.all([api.get<PublicUser[]>('/api/admin/users'), api.get<PublicUser | null>('/api/auth/me')])
    setUsers(usersRes.data ?? [])
    setMe(meRes.data ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function act(id: string, action: 'approve' | 'reject' | 'suspend' | 'revoke') {
    await api.post(`/api/admin/users/${id}/${action}`)
    load()
  }

  async function changeRole(id: string, role: 'ADMIN' | 'USER') {
    await api.post(`/api/admin/users/${id}/role`, { role })
    load()
  }

  const pending = users.filter((u) => u.status === 'PENDING')
  const others = users.filter((u) => u.status !== 'PENDING')

  if (loading) return <p className="text-sm text-slate-400">불러오는 중...</p>

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">승인 대기 ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-xs text-slate-400">대기 중인 가입 신청이 없습니다</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {pending.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{u.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {u.email} · {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => act(u.id, 'approve')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                    <Check size={12} /> 승인
                  </button>
                  <button onClick={() => act(u.id, 'reject')} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-500">
                    <X size={12} /> 거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-600">전체 사용자</h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {others.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800">
                  {u.name}
                  {u.role === 'ADMIN' && <ShieldCheck size={13} className="text-blue-500" />}
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_TONE[u.status])}>{STATUS_LABEL[u.status]}</span>
                </p>
                <p className="truncate text-xs text-slate-400">{u.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {u.status === 'APPROVED' && (
                  <button onClick={() => act(u.id, 'suspend')} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-500">
                    <ShieldOff size={12} /> 정지
                  </button>
                )}
                {(u.status === 'SUSPENDED' || u.status === 'REJECTED') && (
                  <button onClick={() => act(u.id, 'approve')} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-600">
                    <RotateCcw size={12} /> 재승인
                  </button>
                )}
                <select
                  value={u.role}
                  disabled={u.id === me?.id}
                  onChange={(e) => changeRole(u.id, e.target.value as 'ADMIN' | 'USER')}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
