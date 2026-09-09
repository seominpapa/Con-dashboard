import { useState, type FormEvent } from 'react'
import { Scale } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { api } from '../lib/api'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { LawItem } from '../../shared/types/law'
import { LAW_SEARCH_MAX_LENGTH, LAW_SEARCH_MIN_LENGTH, LAW_SELECTION_MAX, RECOMMENDED_LAWS } from '../../shared/types/law'

export function LawWidget({ settings, onSettingsChange }: WidgetProps) {
  const configured = settings.lawNames
  const lawNames = Array.isArray(configured) && configured.every((name) => typeof name === 'string')
    ? configured as string[]
    : [...RECOMMENDED_LAWS]
  const path = `/api/laws?names=${encodeURIComponent(lawNames.join(','))}`
  const { data, loading, error, stale, isMock, updatedAt, asOf, refresh } = useWidgetData<LawItem[]>(path, 12 * 60 * 60 * 1000)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LawItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const updateLawNames = (next: string[]) => onSettingsChange({ ...settings, lawNames: next })

  async function search(event: FormEvent) {
    event.preventDefault()
    const normalized = query.trim()
    if (normalized.length < LAW_SEARCH_MIN_LENGTH) {
      setSearchError(`${LAW_SEARCH_MIN_LENGTH}자 이상 입력해 주세요`)
      return
    }
    setSearching(true)
    setSearchError(null)
    const response = await api.get<LawItem[]>(`/api/laws/search?q=${encodeURIComponent(normalized)}`)
    setSearching(false)
    if (response.status === 'success' && response.data) setResults(response.data)
    else setSearchError(response.message ?? '법령 검색에 실패했습니다')
  }

  function addLaw(name: string) {
    if (lawNames.includes(name) || lawNames.length >= LAW_SELECTION_MAX) return
    updateLawNames([...lawNames, name])
  }

  function removeLaw(name: string) {
    if (lawNames.length === 1) return
    updateLawNames(lawNames.filter((lawName) => lawName !== name))
  }

  return (
    <WidgetShell title="법령·제도" icon={<Scale size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} asOf={asOf} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-slate-700">{l.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {l.changed && <Badge tone="caution">개정</Badge>}
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline" title={`${l.name} 국가법령정보센터에서 확인`}>
                    {l.lastAmendedDate || '상세보기'}
                  </a>
                ) : (
                  <span className="text-[10px] text-slate-400">{l.lastAmendedDate}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
      <details className="mt-3 border-t border-slate-100 pt-2 text-xs">
        <summary className="cursor-pointer text-blue-600">법령 추가/관리</summary>
        <div className="mt-2 flex flex-wrap gap-1">
          {lawNames.map((name) => (
            <button key={name} type="button" onClick={() => removeLaw(name)} disabled={lawNames.length === 1} className="rounded bg-slate-100 px-2 py-1 text-slate-600 disabled:cursor-not-allowed" aria-label={`${name} 제거`}>
              {name} ×
            </button>
          ))}
        </div>
        <form onSubmit={search} className="mt-2 flex gap-1">
          <input value={query} onChange={(event) => setQuery(event.target.value)} minLength={LAW_SEARCH_MIN_LENGTH} maxLength={LAW_SEARCH_MAX_LENGTH} placeholder="법령명 검색" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1" aria-label="추가할 법령 검색" />
          <button type="submit" disabled={searching} className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50">{searching ? '검색 중' : '검색'}</button>
        </form>
        {searchError && <p className="mt-1 text-red-600">{searchError}</p>}
        {results.length > 0 && (
          <ul className="mt-1 max-h-28 overflow-auto rounded border border-slate-100">
            {results.map((law) => (
              <li key={law.id}>
                <button type="button" onClick={() => addLaw(law.name)} disabled={lawNames.includes(law.name) || lawNames.length >= LAW_SELECTION_MAX} className="w-full px-2 py-1 text-left hover:bg-slate-50 disabled:text-slate-300">
                  {law.name}{lawNames.includes(law.name) ? ' (추가됨)' : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </WidgetShell>
  )
}
