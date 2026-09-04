import { useState } from 'react'
import { MapPin, Plus, Trash2, Edit2 } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/ui/Modal'
import { useSites } from '../context/SiteContext'
import { SITE_STATUS_LABEL, type Site, type SiteStatus } from '../../shared/types/site'

const STATUS_OPTIONS = Object.entries(SITE_STATUS_LABEL) as [SiteStatus, string][]

const EMPTY_FORM = { name: '', company: '', address: '', latitude: '', longitude: '', startDate: '', endDate: '', status: 'active' as SiteStatus }

/** 다중 현장 관리 (기획 18번): 현장 CRUD + 위경도 -> 기상청 격자좌표 변환은 서버에서 처리 */
export function SitesPage() {
  const { sites, refetch, setActiveSiteId } = useSites()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  function openEdit(s: Site) {
    setEditing(s)
    setForm({
      name: s.name,
      company: s.company,
      address: s.address,
      latitude: String(s.latitude),
      longitude: String(s.longitude),
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.name || !form.latitude || !form.longitude) return
    const payload = { ...form, latitude: Number(form.latitude), longitude: Number(form.longitude) }
    if (editing) {
      await api.patch(`/api/sites/${editing.id}`, payload)
    } else {
      const res = await api.post<Site>('/api/sites', payload)
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
          <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="현장명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="시공사 (선택)"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="주소"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="위도 (예: 37.5663)"
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            />
            <input
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="경도 (예: 126.9779)"
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            />
          </div>
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
          <p className="text-[11px] text-slate-400">위도/경도를 입력하면 기상청 격자좌표로 자동 변환되어 저장됩니다.</p>
          <button onClick={handleSave} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">
            저장
          </button>
        </div>
      </Modal>
    </div>
  )
}
