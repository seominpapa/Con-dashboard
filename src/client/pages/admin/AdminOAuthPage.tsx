import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'

interface OAuthStatus {
  status: 'CONNECTED' | 'DISCONNECTED'
  source: 'database' | 'environment' | null
  environmentConfigured: boolean
  databaseConfigured: boolean
  candidateConfigured: boolean
  forcedEnvironment: boolean
  verificationCallbackUrl: string
  loginCallbackUrl: string
}

export function AdminOAuthPage() {
  const [status, setStatus] = useState<OAuthStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.get('verified')) return 'Google OAuth 검증이 완료되어 새 설정이 활성화됐습니다.'
    if (query.get('error')) return 'Google OAuth 검증에 실패했습니다. Client ID, Secret, Redirect URI를 확인해 주세요.'
    return null
  })

  async function load() {
    const res = await api.get<OAuthStatus>('/api/admin/oauth')
    setStatus(res.data ?? null)
    if (res.status === 'error') setMessage(res.message ?? 'OAuth 설정을 불러오지 못했습니다.')
  }

  useEffect(() => {
    load()
  }, [])

  async function saveCandidate() {
    setBusy(true)
    setMessage(null)
    const res = await api.post('/api/admin/oauth/google/candidate', { clientId, clientSecret })
    setBusy(false)
    if (res.status === 'error') {
      setMessage(res.message ?? 'OAuth 설정을 저장하지 못했습니다.')
      return
    }
    setClientId('')
    setClientSecret('')
    setMessage('후보 설정을 저장했습니다. Google 로그인으로 검증해야 활성화됩니다.')
    await load()
  }

  async function disconnect() {
    setBusy(true)
    const res = await api.post('/api/admin/oauth/google/disconnect')
    setBusy(false)
    setMessage(res.status === 'error' ? res.message ?? '연결 해제에 실패했습니다.' : 'DB OAuth 설정을 해제했습니다.')
    await load()
  }

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <ShieldCheck size={15} /> Google OAuth 관리자 로그인
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        최초 관리자 로그인은 Cloudflare 환경변수로 설정하고, 이후 Client ID와 Client Secret을 이 화면에서 안전하게 교체할 수 있습니다.
      </p>

      {message && <p role="alert" className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{message}</p>}

      <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="flex items-center gap-1.5 font-medium text-slate-700">
          <CheckCircle2 size={14} className={status?.status === 'CONNECTED' ? 'text-emerald-500' : 'text-slate-300'} />
          {status?.status === 'CONNECTED' ? '연결됨' : '미연결'}
          {status?.source ? ` · ${status.source === 'database' ? '관리자 등록' : 'Cloudflare ENV'}` : ''}
        </p>
        {status?.forcedEnvironment && <p className="mt-1 text-amber-600">FORCE_ENV_GOOGLE_OAUTH가 켜져 있어 DB 설정을 사용하지 않습니다.</p>}
        <p className="mt-2">Google Cloud에 아래 Redirect URI 두 개를 모두 등록하세요.</p>
        <code className="mt-1 block break-all rounded bg-slate-50 px-2 py-1 text-slate-700">{status?.verificationCallbackUrl ?? '불러오는 중...'}</code>
        <code className="mt-1 block break-all rounded bg-slate-50 px-2 py-1 text-slate-700">{status?.loginCallbackUrl ?? '불러오는 중...'}</code>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <a className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">
          Google OAuth Client 발급 사이트 <ExternalLink size={12} />
        </a>
        <label className="block text-xs font-medium text-slate-500">
          Client ID
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="...apps.googleusercontent.com" value={clientId} onChange={(event) => setClientId(event.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Client Secret
          <input type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
        </label>
        <button onClick={saveCandidate} disabled={busy || !clientId.trim() || !clientSecret.trim()} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '저장 중...' : '후보 설정 저장'}
        </button>
        {status?.candidateConfigured && (
          <a href="/api/admin/oauth/google/verify" className="block w-full rounded-lg bg-emerald-600 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700">
            Google 로그인으로 검증하고 활성화
          </a>
        )}
        {status?.databaseConfigured && (
          <button onClick={disconnect} disabled={busy} className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
            DB OAuth 설정 해제 (ENV 폴백)
          </button>
        )}
      </div>
    </div>
  )
}
