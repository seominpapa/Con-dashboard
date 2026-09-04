import { HardHat } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * 로그인 페이지. Google OAuth만 지원한다 (기획 31번).
 * 사용자는 API Key를 다루지 않으며, 여기에는 그 어떤 API Key 입력 UI도 존재하지 않는다.
 */
export function Login() {
  const { googleEnabled } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
          <HardHat size={24} />
        </div>
        <h1 className="text-lg font-bold text-slate-800">건설 Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">건설업 종사자를 위한 맞춤형 업무 대시보드</p>

        <div className="mt-8">
          {googleEnabled ? (
            <a
              href="/api/auth/google"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <GoogleIcon />
              Google로 시작하기
            </a>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-3 text-xs text-amber-700">
              Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.
            </p>
          )}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
          가입 후 관리자 승인이 완료되어야 대시보드를 이용할 수 있습니다.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C40.905 35.936 44 30.435 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}
