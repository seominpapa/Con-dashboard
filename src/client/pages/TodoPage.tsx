import { useEffect, useState } from 'react'
import { CheckSquare, Plus, Trash2, Square, CheckSquare as CheckSquareFilled } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/ui/Modal'
import { TODO_PRIORITY_LABEL, type TodoItem, type TodoPriority } from '../../shared/types/todo'
import { cn } from '../lib/cn'

const PRIORITY_OPTIONS = Object.entries(TODO_PRIORITY_LABEL) as [TodoPriority, string][]

export function TodoPage() {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', dueDate: '', priority: 'normal' as TodoPriority })

  async function load() {
    setLoading(true)
    const res = await api.get<TodoItem[]>('/api/todos')
    setTodos(res.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate() {
    if (!form.title) return
    await api.post('/api/todos', { ...form, status: 'todo' })
    setOpen(false)
    setForm({ title: '', dueDate: '', priority: 'normal' })
    load()
  }

  async function toggleStatus(t: TodoItem) {
    const nextStatus = t.status === 'done' ? 'todo' : 'done'
    await api.patch(`/api/todos/${t.id}`, { status: nextStatus, completedAt: nextStatus === 'done' ? new Date().toISOString() : null })
    load()
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/todos/${id}`)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <CheckSquare size={20} /> 할일관리
        </h1>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus size={14} /> 새 할 일
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : todos.length === 0 ? (
        <p className="text-sm text-slate-400">할 일이 없습니다</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button onClick={() => toggleStatus(t)} className="text-slate-400 hover:text-emerald-500">
                  {t.status === 'done' ? <CheckSquareFilled size={16} className="text-emerald-500" /> : <Square size={16} />}
                </button>
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-medium', t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800')}>{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {TODO_PRIORITY_LABEL[t.priority]}
                    {t.dueDate ? ` · 마감 ${t.dueDate}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => handleDelete(t.id)} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="새 할 일 추가">
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="할 일 제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TodoPriority })}>
              {PRIORITY_OPTIONS.map(([k, label]) => (
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
