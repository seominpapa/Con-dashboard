import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Scaling, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { getWidgetDefinition } from '../../widgets/registry'
import type { DashboardWidgetInstance } from '../../lib/dashboardRepository'
import type { WidgetSize } from '../../../shared/types/widget'

interface WidgetCardProps {
  instance: DashboardWidgetInstance
  siteId: string
  size: WidgetSize
  minSize: WidgetSize
  maxSize: WidgetSize
  onHide: (instanceId: string) => void
  onResize: (instanceId: string, size: WidgetSize) => void
  onSettingsChange: (instanceId: string, settings: Record<string, unknown>) => void
}

/** 그리드는 xl에서 3열이므로 너비는 3까지만 고른다. */
export const MAX_COLUMNS = 3
export const MAX_ROWS = 3
const SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-2 xl:col-span-3',
}
const ROW_CLASS: Record<number, string> = {
  1: 'md:row-span-1',
  2: 'md:row-span-2',
  3: 'md:row-span-3',
}

/**
 * Dashboard에 배치된 Widget 인스턴스 1개. 카드 전체가 @dnd-kit sortable 드래그
 * 대상이며(활성화에 8px 이동 임계값을 두어 내부 버튼 클릭과 충돌하지 않음),
 * 카드 모서리에 떠있는 배지형 버튼으로 크기 조절(너비·높이 선택)/숨기기를 제공한다.
 * Widget 자체 컴포넌트는 Widget Registry에서 조회하며 하드코딩하지 않는다.
 */
export function WidgetCard({ instance, siteId, size, minSize, maxSize, onHide, onResize, onSettingsChange }: WidgetCardProps) {
  const def = getWidgetDefinition(instance.widgetId)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.instanceId })
  const [sizeOpen, setSizeOpen] = useState(false)

  if (!def) return null

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const Component = def.component
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const axes: { label: string; key: keyof WidgetSize; min: number; max: number }[] = [
    { label: '너비', key: 'w', min: Math.min(minSize.w, MAX_COLUMNS), max: Math.min(maxSize.w, MAX_COLUMNS) },
    { label: '높이', key: 'h', min: Math.min(minSize.h, MAX_ROWS), max: Math.min(maxSize.h, MAX_ROWS) },
  ]

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(SPAN_CLASS[size.w] ?? 'col-span-1', ROW_CLASS[size.h] ?? 'md:row-span-1', isDragging && 'opacity-50 shadow-lg', 'group relative min-h-0 cursor-grab touch-none active:cursor-grabbing')}
    >
      <div className={cn('absolute -top-2 -right-2 z-10 flex gap-1 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100', sizeOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); setSizeOpen((open) => !open) }}
          className={cn('flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50', sizeOpen && 'bg-slate-100')}
          aria-label="위젯 크기 조절"
          aria-expanded={sizeOpen}
          title="크기 조절"
        >
          <Scaling size={11} />
        </button>
        <button
          onPointerDown={stop}
          onClick={(e) => { stop(e); onHide(instance.instanceId) }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-red-50 hover:text-red-500"
          aria-label="위젯 숨기기"
          title="위젯 숨기기"
        >
          <X size={12} />
        </button>
      </div>
      {sizeOpen && (
        <div role="group" aria-label="위젯 크기" onPointerDown={stop} onClick={stop} className="absolute top-5 right-0 z-20 cursor-default rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-600 shadow-lg">
          {axes.map((axis) => (
            <div key={axis.key} className="flex items-center gap-1 py-0.5">
              <span className="w-7 text-slate-400">{axis.label}</span>
              {Array.from({ length: axis.max }, (_, index) => index + 1).map((value) => (
                <button
                  key={value}
                  disabled={value < axis.min}
                  aria-pressed={size[axis.key] === value}
                  onClick={() => { onResize(instance.instanceId, { ...size, [axis.key]: value }); setSizeOpen(false) }}
                  className={cn('h-6 w-6 rounded border text-center tabular-nums', size[axis.key] === value ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700' : 'border-slate-200 hover:bg-slate-50', value < axis.min && 'cursor-not-allowed opacity-30')}
                >
                  {value}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="h-full [&_button]:cursor-pointer">
        <Component
          instanceId={instance.instanceId}
          siteId={siteId}
          settings={instance.settings ?? {}}
          onSettingsChange={(settings) => onSettingsChange(instance.instanceId, settings)}
        />
      </div>
    </div>
  )
}
