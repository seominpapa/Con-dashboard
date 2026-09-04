import { useEffect, useState } from 'react'
import { Calendar, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/ui/Modal'
import { SCHEDULE_CATEGORY_LABEL, SCHEDULE_IMPORTANCE_LABEL, type ScheduleCategory, type ScheduleEvent, type ScheduleImportance } from '../../shared/types/schedule'

const CATEGORY_OPTIONS = Object.entries(SCHEDULE_CATEGORY_LABEL) as [ScheduleCategory, string][]
const IMPORTANCE_OPTIONS = Object.entries(SCHEDULE_IMPORTANCE_LABEL) as [ScheduleImportance, string][]

export function SchedulePage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', startAt: '', endAt: '', location: '', category: 'meeting' as ScheduleCategory, importance: 'normal' as ScheduleImportance })

  async function load() {
    setLoading(true)
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    const res = await api.get<ScheduleEvent[]>(`/api/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    setEvents((res.data ?? []).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate() {
    if (!form.title || !form.startAt || !form.endAt) return
    await api.post('/api/schedules', form)
    setOpen(false)
    setForm({ title: '', startAt: '', endAt: '', location: '', category: 'meeting', importance: 'normal' })
    load()
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/schedules/${id}`)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <Calendar size={20} /> 일정관리
        </h1>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus size={14} /> 새 일정
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 일정이 없습니다</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{e.title}</p>
                <p className="text-xs text-slate-400">
                  {new Date(e.startAt).toLocaleString('ko-KR')} · {SCHEDULE_CATEGORY_LABEL[e.category]} · {SCHEDULE_IMPORTANCE_LABEL[e.importance]}
                  {e.location ? ` · ${e.location}` : ''}
                </p>
              </div>
              <button onClick={() => handleDelete(e.id)} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="새 일정 추가">
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="일정 제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            <input type="datetime-local" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
          </div>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="장소 (선택)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ScheduleCategory })}>
              {CATEGORY_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.importance}
              onChange={(e) => setForm({ ...form, importance: e.target.value as ScheduleImportance })}
            >
              {IMPORTANCE_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleCreate} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">
            추가
          </button>
        </div>
      </Modal>
    </div>
  )
}
