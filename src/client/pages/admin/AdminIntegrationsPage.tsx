import { useEffect, useState } from 'react'
import { Plug, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'

interface IntegrationRow {
  provider: string
  label: string
  envVar: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED' | 'CHECKING'
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  envFallbackAvailable: boolean
  dbConfigured: boolean
}

const STATUS_META: Record<IntegrationRow['status'], { label: string; icon: any; cls: string }> = {
  CONNECTED: { label: '연결됨', icon: CheckCircle2, cls: 'text-emerald-600' },
  DISCONNECTED: { label: '미연결', icon: XCircle, cls: 'text-slate-400' },
  ERROR: { label: '오류', icon: AlertCircle, cls: 'text-red-500' },
  EXPIRED: { label: '만료', icon: AlertCircle, cls: 'text-amber-500' },
  CHECKING: { label: '확인 중', icon: Loader2, cls: 'text-slate-400' },
}

/**
 * 공개데이터 API 연결 센터 (기획 33~34번): 7개 Provider의 자격증명을 여기서만
 * 등록/저장한다. 사용자는 절대 이 화면을 볼 수 없으며(관리자 전용 라우트),
 * 자격증명은 AES-GCM으로 암호화되어 DB에 저장되고 응답에는 값 자체가 포함되지 않는다.
 */
export function AdminIntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<IntegrationRow | null>(null)
  const [credInputs, setCredInputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await api.get<IntegrationRow[]>('/api/admin/integrations')
    setRows(res.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function fieldsFor(provider: string): { key: string; label: string; placeholder: string }[] {
    if (provider === 'naver') {
      return [
        { key: 'clientId', label: 'Client ID', placeholder: 'Naver Client ID' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'Naver Client Secret' },
      ]
    }
    return [{ key: 'apiKey', label: 'API Key', placeholder: '서비스 인증키' }]
  }

  async function handleConnect() {
    if (!editing) return
    setBusy(editing.provider)
    await api.post(`/api/admin/integrations/${editing.provider}/connect`, { credential: credInputs })
    setBusy(null)
    setEditing(null)
    setCredInputs({})
    load()
  }

  async function handleTest(provider: string) {
    setBusy(provider)
    await api.post(`/api/admin/integrations/${provider}/test`)
    setBusy(null)
    load()
  }

  async function handleDisconnect(provider: string) {
    setBusy(provider)
    await api.post(`/api/admin/integrations/${provider}/disconnect`)
    setBusy(null)
    load()
  }

  if (loading) return <p className="text-sm text-slate-400">불러오는 중...</p>

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Plug size={15} /> 공개 데이터 API 연결 센터
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        여기서 연결한 자격증명은 암호화되어 저장되며, 승인된 모든 사용자가 즉시 공유해서 사용합니다. 환경변수(ENV)로 설정된 값이 있으면 자동으로 폴백됩니다.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map((r) => {
          const meta = STATUS_META[r.status]
          return (
            <li key={r.provider} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <meta.icon size={14} className={meta.cls} /> {r.label}
                </p>
                <p className="text-xs text-slate-400">
                  {meta.label}
                  {r.dbConfigured ? ' · 관리자 등록됨' : r.envFallbackAvailable ? ' · ENV 폴백 사용 중' : ' · 미설정 (Mock 사용 중)'}
                  {r.lastError ? ` · ${r.lastError}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => handleTest(r.provider)}
                  disabled={busy === r.provider}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  연결 테스트
                </button>
                <button
                  onClick={() => {
                    setEditing(r)
                    setCredInputs({})
                  }}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {r.dbConfigured ? '자격증명 변경' : '연결하기'}
                </button>
                {r.dbConfigured && (
                  <button onClick={() => handleDisconnect(r.provider)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-500">
                    연결 해제
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.label} 연결` : ''}>
        <div className="space-y-3">
          {editing &&
            fieldsFor(editing.provider).map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-slate-500">{f.label}</label>
                <input
                  type="password"
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={f.placeholder}
                  value={credInputs[f.key] ?? ''}
                  onChange={(e) => setCredInputs({ ...credInputs, [f.key]: e.target.value })}
                />
              </div>
            ))}
          <p className="text-[11px] text-slate-400">저장 즉시 실제 연결 테스트가 수행됩니다. 값은 암호화되어 저장되며 이후 다시 조회할 수 없습니다.</p>
          <button
            onClick={handleConnect}
            disabled={busy === editing?.provider}
            className={cn('w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700', busy === editing?.provider && 'opacity-50')}
          >
            {busy === editing?.provider ? '연결 확인 중...' : '저장 및 연결'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
