import { Hourglass } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * 승인 대기 화면 (기획 31번): PENDING 상태 사용자는 이 화면 외에는 아무것도
 * 볼 수 없다. Server Middleware(requireApproved)가 별도로 API 접근을 차단하므로
 * 이 화면은 순수 안내용이며 우회해도 실제 데이터는 노출되지 않는다.
 */
export function PendingApproval() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <Hourglass size={24} />
        </div>
        <h1 className="text-lg font-bold text-slate-800">
          {user?.status === 'REJECTED' ? '가입이 거절되었습니다' : user?.status === 'SUSPENDED' ? '계정이 정지되었습니다' : '관리자 승인 대기 중입니다'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {user?.status === 'REJECTED' || user?.status === 'SUSPENDED'
            ? '자세한 사항은 관리자에게 문의해주세요.'
            : '가입 신청이 접수되었습니다. 관리자가 승인하면 대시보드를 이용할 수 있어요.'}
        </p>

        <dl className="mt-6 space-y-1.5 rounded-lg bg-slate-50 p-4 text-left text-xs">
          <div className="flex justify-between">
            <dt className="text-slate-400">이름</dt>
            <dd className="font-medium text-slate-700">{user?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">이메일</dt>
            <dd className="font-medium text-slate-700">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">신청일</dt>
            <dd className="font-medium text-slate-700">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '-'}</dd>
          </div>
        </dl>

        <button onClick={logout} className="mt-6 text-xs font-medium text-slate-400 underline hover:text-slate-600">
          로그아웃
        </button>
      </div>
    </div>
  )
}
