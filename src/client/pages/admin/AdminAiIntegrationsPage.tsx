import { useEffect, useState } from 'react'
import { Bot, CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import { OPENAI_MODELS } from '../../../shared/types/integration'

interface AiRow {
  provider: 'claude' | 'codex'
  label: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED' | 'CHECKING'
  lastError: string | null
  envFallbackAvailable: boolean
  dbConfigured: boolean
  model: string | null
}

const STATUS_META: Record<AiRow['status'], { label: string; icon: any; cls: string }> = {
  CONNECTED: { label: '연결됨', icon: CheckCircle2, cls: 'text-emerald-600' },
  DISCONNECTED: { label: '미연결', icon: XCircle, cls: 'text-slate-400' },
  ERROR: { label: '오류', icon: AlertCircle, cls: 'text-red-500' },
  EXPIRED: { label: '만료', icon: AlertCircle, cls: 'text-amber-500' },
  CHECKING: { label: '확인 중', icon: AlertCircle, cls: 'text-slate-400' },
}

const API_KEY_URL = {
  claude: 'https://platform.claude.com/settings/keys',
  codex: 'https://platform.openai.com/api-keys',
} as const

const SUBSCRIPTION_OAUTH_NOTES = [
  'ChatGPT/Codex 구독 로그인은 별도 Codex App Server가 필요해 현재 Cloudflare 배포에서는 연결할 수 없습니다.',
  'Claude Pro/Max 구독 OAuth는 이 웹앱의 공유 서버 연동에 사용할 수 없으므로 Anthropic API Key가 필요합니다.',
]

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
  const [model, setModel] = useState<string>(OPENAI_MODELS[0])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await api.get<{ providers: AiRow[]; defaultProvider: string | null }>('/api/admin/integrations/ai')
    setError(res.status === 'error' ? res.message ?? 'LLM 연동 정보를 불러오지 못했습니다' : null)
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
    setError(null)
    const res = await api.post(`/api/admin/integrations/ai/${editing.provider}/connect`, { apiKey, model })
    setBusy(null)
    if (res.status === 'error') {
      setError(res.message ?? 'LLM Provider 연결에 실패했습니다')
      return
    }
    setEditing(null)
    setApiKey('')
    setModel(OPENAI_MODELS[0])
    await load()
  }

  async function handleTest(provider: string) {
    setBusy(provider)
    setError(null)
    const res = await api.post<{ health: { ok: boolean; message?: string } }>(`/api/admin/integrations/ai/${provider}/test`)
    setBusy(null)
    await load()
    if (res.status === 'error') setError(res.message ?? '연결 테스트에 실패했습니다')
    else if (res.data && !res.data.health.ok) setError(res.data.health.message ?? '연결 테스트에 실패했습니다')
  }

  async function handleDisconnect(provider: string) {
    setBusy(provider)
    setError(null)
    const res = await api.post(`/api/admin/integrations/ai/${provider}/disconnect`)
    setBusy(null)
    await load()
    if (res.status === 'error') setError(res.message ?? '연결 해제에 실패했습니다')
  }

  async function handleSetDefault(provider: string) {
    setError(null)
    const res = await api.put('/api/admin/integrations/ai/default', { provider })
    await load()
    if (res.status === 'error') setError(res.message ?? '기본 Provider 설정에 실패했습니다')
  }

  if (loading) return <p className="text-sm text-slate-400">불러오는 중...</p>

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Bot size={15} /> LLM Provider (AI 브리핑)
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        이 화면에서는 Anthropic/OpenAI 공식 API Key를 등록하고 AI 브리핑의 기본 Provider를 선택합니다.
      </p>
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {SUBSCRIPTION_OAUTH_NOTES.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
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
                  {r.provider === 'codex' ? ` · ${r.model ?? OPENAI_MODELS[0]}` : ''}
                  {r.lastError ? ` · ${r.lastError}` : ''}
                </p>
                <a
                  href={API_KEY_URL[r.provider]}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
                >
                  API Key 발급 사이트 <ExternalLink size={11} />
                </a>
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
                    setModel(r.model ?? OPENAI_MODELS[0])
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
          {editing?.provider === 'codex' && (
            <div>
              <label htmlFor="openai-model" className="mb-1 block text-xs font-medium text-slate-500">GPT 모델</label>
              <select
                id="openai-model"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                {OPENAI_MODELS.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            모델 제공사의 공식 API Key만 입력하세요. Codex/Claude 구독 로그인 OAuth는 이 서버 배포에서 중계하지 않으며, 저장 전 실제 연결을 확인합니다.
          </p>
          {editing && (
            <a href={API_KEY_URL[editing.provider]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
              API Key 발급 사이트 <ExternalLink size={12} />
            </a>
          )}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
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
