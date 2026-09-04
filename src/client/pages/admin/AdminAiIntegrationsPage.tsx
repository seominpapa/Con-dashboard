import { useEffect, useState } from 'react'
import { Bot, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'

interface AiRow {
  provider: 'claude' | 'codex'
  label: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED' | 'CHECKING'
  lastError: string | null
  envFallbackAvailable: boolean
  dbConfigured: boolean
}

const STATUS_META: Record<AiRow['status'], { label: string; icon: any; cls: string }> = {
  CONNECTED: { label: '연결됨', icon: CheckCircle2, cls: 'text-emerald-600' },
  DISCONNECTED: { label: '미연결', icon: XCircle, cls: 'text-slate-400' },
  ERROR: { label: '오류', icon: AlertCircle, cls: 'text-red-500' },
  EXPIRED: { label: '만료', icon: AlertCircle, cls: 'text-amber-500' },
  CHECKING: { label: '확인 중', icon: AlertCircle, cls: 'text-slate-400' },
}

/**
 * LLM Provider 관리 (기획 33, 52번): Claude / Codex(OpenAI) 공식 API Key 연동만
 * 지원한다. 반드시 공식 API Key 인증만 사용하며 CLI OAuth 자격증명 파일을 읽지
 * 않는다. 관리자가 선택한 defaultLLMProvider 1개를 모든 승인된 사용자가 공유한다.
 */
export function AdminAiIntegrationsPage() {
  const [rows, setRows] = useState<AiRow[]>([])
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AiRow | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await api.get<{ providers: AiRow[]; defaultProvider: string | null }>('/api/admin/integrations/ai')
    setRows(res.data?.providers ?? [])
    setDefaultProvider(res.data?.defaultProvider ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleConnect() {
    if (!editing) return
    setBusy(editing.provider)
    await api.post(`/api/admin/integrations/ai/${editing.provider}/connect`, { apiKey })
    setBusy(null)
    setEditing(null)
    setApiKey('')
    load()
  }

  async function handleTest(provider: string) {
    setBusy(provider)
    await api.post(`/api/admin/integrations/ai/${provider}/test`)
    setBusy(null)
    load()
  }

  async function handleDisconnect(provider: string) {
    setBusy(provider)
    await api.post(`/api/admin/integrations/ai/${provider}/disconnect`)
    setBusy(null)
    load()
  }

  async function handleSetDefault(provider: string) {
    await api.put('/api/admin/integrations/ai/default', { provider })
    load()
  }

  if (loading) return <p className="text-sm text-slate-400">불러오는 중...</p>

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Bot size={15} /> LLM Provider (AI 브리핑)
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        Claude 또는 Codex/OpenAI 공식 API Key로만 연동할 수 있습니다. 선택한 기본 Provider는 승인된 모든 사용자의 AI 브리핑에 공통으로 사용됩니다.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map((r) => {
          const meta = STATUS_META[r.status]
          return (
            <li key={r.provider} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <meta.icon size={14} className={meta.cls} /> {r.label}
                  {defaultProvider === r.provider && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">기본 Provider</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {meta.label}
                  {r.dbConfigured ? ' · 관리자 등록됨' : r.envFallbackAvailable ? ' · ENV 폴백 사용 중' : ' · 미설정'}
                  {r.lastError ? ` · ${r.lastError}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {r.status === 'CONNECTED' && defaultProvider !== r.provider && (
                  <button onClick={() => handleSetDefault(r.provider)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
                    기본으로 설정
                  </button>
                )}
                <button onClick={() => handleTest(r.provider)} disabled={busy === r.provider} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                  연결 테스트
                </button>
                <button
                  onClick={() => {
                    setEditing(r)
                    setApiKey('')
                  }}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {r.dbConfigured ? 'API Key 변경' : '연결하기'}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">공식 API Key</label>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={editing?.provider === 'claude' ? 'sk-ant-...' : 'sk-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            공식 API Key 인증만 지원합니다. CLI 로그인(OAuth) 방식의 자격증명은 사용할 수 없습니다. 저장 즉시 헬스체크가 수행됩니다.
          </p>
          <button
            onClick={handleConnect}
            disabled={!apiKey || busy === editing?.provider}
            className={cn('w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700', (!apiKey || busy === editing?.provider) && 'opacity-50')}
          >
            {busy === editing?.provider ? '연결 확인 중...' : '저장 및 연결'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
