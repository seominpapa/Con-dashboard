import { useEffect, useState } from 'react'
import { Plug, CheckCircle2, XCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
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
  credentialFallbackAvailable: boolean
  dbConfigured: boolean
  docsUrl?: string
  expiresAt: string | null
  daysUntilExpiry: number | null
  noExpiry: boolean
  memo: string
}

const STATUS_META: Record<IntegrationRow['status'], { label: string; icon: any; cls: string }> = {
  CONNECTED: { label: '연결됨', icon: CheckCircle2, cls: 'text-emerald-600' },
  DISCONNECTED: { label: '미연결', icon: XCircle, cls: 'text-slate-400' },
  ERROR: { label: '오류', icon: AlertCircle, cls: 'text-red-500' },
  EXPIRED: { label: '만료', icon: AlertCircle, cls: 'text-amber-500' },
  CHECKING: { label: '확인 중', icon: Loader2, cls: 'text-slate-400' },
}

/**
 * 공개데이터 API 연결 센터: 공공 API 자격증명을 여기서만
 * 등록/저장한다. 사용자는 절대 이 화면을 볼 수 없으며(관리자 전용 라우트),
 * 자격증명은 AES-GCM으로 암호화되어 DB에 저장되고 응답에는 값 자체가 포함되지 않는다.
 */
export function AdminIntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<IntegrationRow | null>(null)
  const [credInputs, setCredInputs] = useState<Record<string, string>>({})
  const [expiresAt, setExpiresAt] = useState('')
  const [noExpiry, setNoExpiry] = useState(false)
  const [memo, setMemo] = useState('')
  const [metadataOnly, setMetadataOnly] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await api.get<IntegrationRow[]>('/api/admin/integrations')
    setError(res.status === 'error' ? res.message ?? '연동 정보를 불러오지 못했습니다' : null)
    setRows(res.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function fieldsFor(provider: string): { key: string; label: string; placeholder: string }[] {
    if (provider === 'naver_dynamic_map') return [{ key: 'clientId', label: 'API Key ID (Client ID)', placeholder: 'Dynamic Map 앱의 공개 API Key ID' }]
    if (provider === 'law') {
      return [{ key: 'oc', label: 'OC', placeholder: '공동활용 신청 시 발급된 API 인증값' }]
    }
    if (provider === 'naver_maps') {
      return [
        { key: 'clientId', label: 'API Key ID', placeholder: 'x-ncp-apigw-api-key-id' },
        { key: 'clientSecret', label: 'API Key', placeholder: 'x-ncp-apigw-api-key' },
      ]
    }
    return [{ key: 'apiKey', label: 'API Key', placeholder: '서비스 인증키' }]
  }

  async function handleConnect() {
    if (!editing) return
    setBusy(editing.provider)
    setError(null)
    setNotice(null)
    const management = { expiresAt: noExpiry ? null : expiresAt || null, noExpiry, memo }
    const res = metadataOnly
      ? await api.patch<{ testResult?: { message?: string } }>(`/api/admin/integrations/${editing.provider}/metadata`, management)
      : await api.post<{ testResult?: { message?: string } }>(`/api/admin/integrations/${editing.provider}/connect`, { credential: credInputs, ...management })
    setBusy(null)
    if (res.status === 'error') {
      setError(res.message ?? '저장에 실패했습니다')
      return
    }
    setEditing(null)
    setNotice(res.data?.testResult?.message ?? '관리정보를 저장했습니다')
    setCredInputs({})
    setExpiresAt('')
    await load()
  }

  function openEditor(row: IntegrationRow, onlyMetadata: boolean) {
    setError(null)
    setNotice(null)
    setEditing(row)
    setMetadataOnly(onlyMetadata)
    setCredInputs({})
    setExpiresAt(row.expiresAt ?? '')
    setNoExpiry(row.noExpiry ?? false)
    setMemo(row.memo ?? '')
  }

  async function handleTest(provider: string) {
    setBusy(provider)
    setError(null)
    setNotice(null)
    const res = await api.post<{ testResult: { ok: boolean; message?: string } }>(`/api/admin/integrations/${provider}/test`)
    setBusy(null)
    await load()
    if (res.status === 'error') setError(res.message ?? '연결 테스트에 실패했습니다')
    else if (res.data && !res.data.testResult.ok) setError(res.data.testResult.message ?? '연결 테스트에 실패했습니다')
    else if (res.data?.testResult.ok) setNotice(res.data.testResult.message ?? '연결 확인 완료')
  }

  async function handleDisconnect(provider: string) {
    setBusy(provider)
    setError(null)
    setNotice(null)
    const res = await api.post(`/api/admin/integrations/${provider}/disconnect`)
    setBusy(null)
    await load()
    if (res.status === 'error') setError(res.message ?? '연결 해제에 실패했습니다')
  }

  if (loading) return <p className="text-sm text-slate-400">불러오는 중...</p>

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Plug size={15} /> 공개 데이터 API 연결 센터
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        공개데이터 제공사의 API 인증값/API Key/Client ID를 설정합니다. 입력값은 암호화되어 저장되며, 사이트 로그인용 Google OAuth는 Cloudflare Secrets에서 관리합니다.
      </p>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{notice}</p>}
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
                  {r.provider === 'naver_dynamic_map' && r.status === 'CONNECTED' ? '등록됨 · 지도에서 인증 확인 필요' : meta.label}
                  {r.dbConfigured ? ' · 관리자 등록됨' : r.credentialFallbackAvailable ? (r.provider === 'kma_alert' ? ' · 단기예보 자격증명 재사용 중 (특보 승인 필요)' : r.lastCheckedAt ? ' · 나라장터 자격증명 재사용 중' : ' · 나라장터 자격증명 재사용 가능 · 가격정보 연결 테스트 필요') : r.envFallbackAvailable ? ' · ENV 폴백 사용 중' : ['its', 'naver_maps', 'naver_dynamic_map', 'airkorea_station'].includes(r.provider) ? ' · 미설정' : ' · 미설정 (Mock 사용 중)'}
                  {r.lastError ? ` · ${r.lastError}` : ''}
                </p>
                <p className={cn('mt-0.5 text-[11px]', r.daysUntilExpiry !== null && r.daysUntilExpiry < 0 ? 'text-amber-600' : 'text-slate-400')}>
                  {r.expiresAt
                    ? `만료일 ${r.expiresAt} · ${r.daysUntilExpiry! < 0 ? '만료됨' : r.daysUntilExpiry === 0 ? '오늘 만료' : `남은 ${r.daysUntilExpiry}일`}`
                    : r.noExpiry ? '만료 없음' : '만료일 미설정'}
                </p>
                {r.memo && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">메모: {r.memo}</p>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => handleTest(r.provider)}
                  disabled={busy !== null}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  {r.provider === 'naver_dynamic_map' ? '설정 확인' : '연결 테스트'}
                </button>
                <button
                  onClick={() => openEditor(r, false)}
                  disabled={busy !== null}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {r.dbConfigured ? '갱신/변경' : '연결하기'}
                </button>
                <button onClick={() => openEditor(r, true)} disabled={busy !== null} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                  만료일·메모
                </button>
                {r.dbConfigured && (
                  <button onClick={() => handleDisconnect(r.provider)} disabled={busy !== null} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-500">
                    연결 해제
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal open={!!editing} onClose={() => { if (!busy) setEditing(null) }} title={editing ? `${editing.label} ${metadataOnly ? '관리정보' : '연결'}` : ''}>
        <div className="space-y-3">
          {metadataOnly && <p className="text-xs text-slate-500">API 키 재입력이나 연결 테스트 없이 만료일과 메모만 저장합니다. 연결상태는 변경하지 않습니다.</p>}
          {editing && !metadataOnly &&
            fieldsFor(editing.provider).map((f) => (
              <div key={f.key}>
                <label htmlFor={`credential-${f.key}`} className="mb-1 block text-xs font-medium text-slate-500">{f.label}</label>
                <input
                  id={`credential-${f.key}`}
                  type={editing.provider === 'naver_dynamic_map' ? 'text' : 'password'}
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={f.placeholder}
                  value={credInputs[f.key] ?? ''}
                  onChange={(e) => setCredInputs({ ...credInputs, [f.key]: e.target.value })}
                />
              </div>
            ))}
          <div>
            <label htmlFor="integration-expiry" className="mb-1 block text-xs font-medium text-slate-500">API Key 만료일 (선택)</label>
            <input
              id="integration-expiry"
              type="date"
              disabled={noExpiry || busy !== null}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={noExpiry} disabled={busy !== null} onChange={(event) => {
                setNoExpiry(event.target.checked)
                if (event.target.checked) setExpiresAt('')
              }} />
              만료 없음
            </label>
            <p className="mt-1 text-[11px] text-slate-400">발급 사이트에 표시된 만료일을 입력하면 갱신 시점을 안내합니다.</p>
          </div>
          <div>
            <label htmlFor="integration-memo" className="mb-1 block text-xs font-medium text-slate-500">관리 메모 (선택)</label>
            <textarea id="integration-memo" rows={3} maxLength={2000} value={memo} disabled={busy !== null}
              onChange={(event) => setMemo(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="승인 상태, 갱신 방법 등 특이사항" />
            <p className="text-[11px] text-slate-400">관리자에게 표시됩니다. API 키·비밀번호 등 비밀정보는 입력하지 마세요. ({memo.length}/2000)</p>
          </div>
          {!metadataOnly && <>
          <p className="text-[11px] text-slate-400">{editing?.provider === 'naver_dynamic_map' ? '저장 시 ID 형식을 확인합니다. 실제 지도 인증은 등록된 도메인의 대시보드에서 확인해야 합니다. 이 ID는 브라우저 지도 SDK에 공개되며 Client Secret은 입력하지 않습니다.' : '저장 즉시 실제 연결 테스트가 수행됩니다. 값은 암호화되어 저장되며 이후 다시 조회할 수 없습니다.'}</p>
          {editing && ['kma', 'kma_alert', 'airkorea', 'airkorea_station', 'g2b', 'material_prices'].includes(editing.provider) && (
            <p className="text-[11px] text-slate-400">공공데이터포털의 인코딩 또는 디코딩 인증키를 모두 사용할 수 있습니다.</p>
          )}
          {editing?.provider === 'law' && (
            <p className="text-[11px] text-slate-400">API Key가 아니라 국가법령정보 공동활용 신청에서 발급된 OC 값을 입력하세요.</p>
          )}
          {editing?.provider === 'kma' && (
            <p className="text-[11px] text-slate-400">
              이 항목은 단기예보를 검사합니다. 특보는 별도 ‘기상청 기상특보’ 항목에서 등록·연결 테스트하세요. 기상특보 조회서비스의 활용신청·승인은 단기예보와 별도입니다.
            </p>
          )}
          {editing?.provider === 'kma_alert' && (
            <p className="text-[11px] text-slate-400"><a href="https://www.data.go.kr/data/15000415/openapi.do" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">기상특보 조회서비스</a> 활용신청 → 승인 확인 → API Key 입력 → 연결 테스트 순서로 진행하세요. 이 항목은 특보 API를 직접 검사하며, 현재 특보가 없어도 정상 연결로 처리합니다. 같은 키를 쓰더라도 특보 서비스 승인이 필요합니다.</p>
          )}
          {editing?.provider === 'airkorea' && (
            <p className="text-[11px] text-slate-400">대기오염 관측값을 조회하는 키입니다. 가까운 측정소의 좌표 조회용 키는 별도 ‘AirKorea 측정소정보’ 항목에 등록하세요. 전용 키가 없으면 이 키를 재사용하며, 측정소정보 서비스 승인도 필요합니다.</p>
          )}
          {editing?.provider === 'airkorea_station' && (
            <p className="text-[11px] text-slate-400"><a href="https://www.data.go.kr/data/15073877/openapi.do" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">측정소정보 조회서비스</a> 활용신청·승인 후 인증키를 등록하세요. 이 키는 측정소명·주소·좌표 조회에만 사용하며, 관측값은 기존 AirKorea 키로 조회합니다. 전용 키가 없으면 기존 키를 재사용합니다. 좌표 조회 실패 시 행정구역으로 대체 조회하며 최근접 여부는 보장하지 않습니다.</p>
          )}
          {editing?.provider === 'material_prices' && (
            <p className="text-[11px] text-slate-400">입찰정보와 별도로 <a href="https://www.data.go.kr/data/15129415/openapi.do" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">나라장터 가격정보현황서비스</a> 활용신청·승인 후 발급된 키를 입력하세요. 전용 키가 없으면 기존 나라장터 키를 재사용할 수 있습니다.</p>
          )}
          {editing?.provider === 'its' && (
            <p className="text-[11px] text-slate-400">교통소통정보와 <a href="https://www.data.go.kr/data/15040465/openapi.do" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">돌발상황정보</a> 두 서비스 모두 활용신청한 API Key를 입력하세요.</p>
          )}
          {editing?.provider === 'naver_maps' && (
            <p className="text-[11px] text-slate-400">Application에서 Geocoding을 선택하세요. <a href="https://www.ncloud.com/product/applicationService/maps?region=KR" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Geocoding은 월 300만 호출까지 무료</a>입니다.</p>
          )}
          {editing?.provider === 'naver_dynamic_map' && (
            <p className="text-[11px] text-slate-400">네이버 콘솔에서 Dynamic Map이 선택된 앱(예: con-dashboard-1)의 API Key ID를 입력하세요. Web 서비스 URL에 현재 대시보드 도메인을 등록하고 이용 한도를 확인하세요. 기존 Geocoding 앱과 별도로 저장됩니다. 저장 후 ‘위젯 추가 → 현장 교통지도’로 확인하세요.</p>
          )}
          {editing?.docsUrl && (
            <a href={editing.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
              {editing.provider === 'law' ? '공동활용 신청/OC 확인 사이트' : 'API Key 발급 사이트'} <ExternalLink size={12} />
            </a>
          )}
          </>}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleConnect}
            disabled={!editing || (!metadataOnly && fieldsFor(editing.provider).some((field) => !credInputs[field.key]?.trim())) || busy !== null}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === editing?.provider ? (metadataOnly ? '저장 중...' : '연결 확인 중...') : metadataOnly ? '관리정보 저장' : editing?.provider === 'naver_dynamic_map' ? '지도 ID 저장' : '저장 및 연결'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
