import { useMemo, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from '../../widgets/registry'
import { resolveIcon } from '../../widgets/iconResolver'
import type { WidgetCategory } from '../../../shared/types/widget'
import { cn } from '../../lib/cn'

interface WidgetPickerProps {
  open: boolean
  onClose: () => void
  activeWidgetIds: string[]
  onAdd: (widgetId: string) => void
}

/**
 * 위젯 추가 다이얼로그 (기획 1번: 추가/제거/숨기기). Widget Registry 메타데이터만으로
 * 목록/카테고리 탭/설명을 그려 새 Widget을 추가할 때 이 파일을 고칠 필요가 없다.
 */
export function WidgetPicker({ open, onClose, activeWidgetIds, onAdd }: WidgetPickerProps) {
  const [category, setCategory] = useState<WidgetCategory | 'all'>('all')

  const filtered = useMemo(
    () => WIDGET_REGISTRY.filter((w) => category === 'all' || w.category === category),
    [category]
  )

  return (
    <Modal open={open} onClose={onClose} title="위젯 추가" widthClass="max-w-2xl">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategory('all')}
          className={cn('rounded-full px-3 py-1 text-xs font-medium', category === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
        >
          전체
        </button>
        {WIDGET_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn('rounded-full px-3 py-1 text-xs font-medium', category === c ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((def) => {
          const Icon = resolveIcon(def.icon)
          const active = activeWidgetIds.includes(def.id)
          return (
            <button
              key={def.id}
              onClick={() => !active && onAdd(def.id)}
              disabled={active}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border p-3 text-left transition',
                active ? 'cursor-default border-slate-100 bg-slate-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
              )}
            >
              <span className="mt-0.5 text-slate-500">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-800">{def.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">{def.category}</span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">{def.description}</span>
              </span>
              <span className="mt-1 text-slate-300">{active ? <Check size={16} className="text-emerald-500" /> : <Plus size={16} />}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
