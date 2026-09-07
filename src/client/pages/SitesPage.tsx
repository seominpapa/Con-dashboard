import { useEffect, useState } from 'react'
import { MapPin, Plus, Trash2, Edit2, Search } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/ui/Modal'
import { useSites } from '../context/SiteContext'
import { SITE_STATUS_LABEL, type Site, type SiteStatus } from '../../shared/types/site'

const STATUS_OPTIONS = Object.entries(SITE_STATUS_LABEL) as [SiteStatus, string][]

const EMPTY_FORM = { name: '', company: '', address: '', startDate: '', endDate: '', status: 'active' as SiteStatus }

interface AddressSearchResult {
  address: string
  roadAddress?: string
  parcelAddress?: string
}

/** 다중 현장 관리 (기획 18번): 현장 CRUD + 위경도 -> 기상청 격자좌표 변환은 서버에서 처리 */
export function SitesPage() {
  const { sites, refetch, setActiveSiteId } = useSites()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([])
  const [addressSearching, setAddressSearching] = useState(false)
  const [addressSearchError, setAddressSearchError] = useState('')
  const [selectedAddress, setSelectedAddress] = useState('')

  useEffect(() => {
    const query = form.address.trim()
    if (!open || query.length < 2 || query === selectedAddress) {
      setAddressResults([])
      setAddressSearching(false)
      setAddressSearchError('')
      return
    }

    let active = true
    setAddressSearching(true)
    const timer = window.setTimeout(async () => {
      const res = await api.get<AddressSearchResult[]>(`/api/sites/address-search?q=${encodeURIComponent(query)}`)
      if (!active) return
      setAddressResults(res.status === 'success' ? res.data ?? [] : [])
      setAddressSearchError(res.status === 'error' ? res.message ?? '주소를 검색할 수 없습니다' : '')
      setAddressSearching(false)
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [form.address, open, selectedAddress])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setAddressResults([])
    setAddressSearchError('')
    setSelectedAddress('')
    setOpen(true)
  }

  function openEdit(s: Site) {
    setEditing(s)
    setForm({
      name: s.name,
      company: s.company,
      address: s.address,
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
    })
    setError('')
    setAddressResults([])
    setAddressSearchError('')
    setSelectedAddress(s.address)
    setOpen(true)
  }

  async function handleSave() {
    if (!form.name || !form.address) return
    setError('')
    if (editing) {
      const res = await api.patch(`/api/sites/${editing.id}`, form)
      if (res.status !== 'success') {
        setError(res.message ?? '현장을 저장할 수 없습니다')
        return
      }
    } else {
      const res = await api.post<Site>('/api/sites', form)
      if (res.status !== 'success') {
        setError(res.message ?? '현장을 저장할 수 없습니다')
        return
      }
      if (res.data) setActiveSiteId(res.data.id)
    }
    setOpen(false)
    refetch()
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/sites/${id}`)
    refetch()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <MapPin size={20} /> 현장 관리
        </h1>
        <button onClick={openCreate} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus size={14} /> 현장 등록
        </button>
      </div>

      {sites.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 현장이 없습니다. 현장을 등록하면 건설날씨/대기질 등 현장환경 위젯을 이용할 수 있습니다.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {sites.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  {s.name} <span className="text-xs text-slate-400">({SITE_STATUS_LABEL[s.status]})</span>
                </p>
                <p className="truncate text-xs text-slate-400">
                  {s.company ? `${s.company} · ` : ''}
                  {s.address} · 격자({s.kmaNx}, {s.kmaNy})
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(s)} className="rounded p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleDelete(s.id)} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? '현장 수정' : '현장 등록'}>
        <div className="space-y-3">
          <input aria-label="현장명" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="현장명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            aria-label="시공사"
            placeholder="시공사 (선택)"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-300" size={14} />
            <input
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm"
              aria-label="현장 주소"
              autoComplete="off"
              list="site-address-results"
              placeholder="주소 검색"
              value={form.address}
              onChange={(e) => {
                const address = e.target.value
                setForm({ ...form, address })
                if (addressResults.some((item) => item.address === address)) {
                  setSelectedAddress(address)
                  setAddressResults([])
                } else {
                  setSelectedAddress('')
                }
              }}
            />
            <datalist id="site-address-results">
              {addressResults.map((item) => <option key={item.address} value={item.address}>{item.parcelAddress}</option>)}
            </datalist>
          </div>
          {addressSearching && <p className="text-[11px] text-slate-400">주소 검색 중...</p>}
          {addressSearchError && <p role="alert" className="text-[11px] text-red-500">{addressSearchError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SiteStatus })}>
            {STATUS_OPTIONS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400">주소를 기준으로 좌표와 기상청 격자좌표가 자동 저장됩니다.</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button disabled={!form.name || !form.address} onClick={handleSave} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            저장
          </button>
        </div>
      </Modal>
    </div>
  )
}
