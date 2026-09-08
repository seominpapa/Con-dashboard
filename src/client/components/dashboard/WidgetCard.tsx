import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { getWidgetDefinition } from '../../widgets/registry'
import type { DashboardWidgetInstance } from '../../lib/dashboardRepository'

interface WidgetCardProps {
  instance: DashboardWidgetInstance
  siteId: string
  span: number
  maxSpan: number
  onHide: (instanceId: string) => void
  onCycleSize: (instanceId: string) => void
  onSettingsChange: (instanceId: string, settings: Record<string, unknown>) => void
}

const SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-2 xl:col-span-3',
}

/**
 * Dashboard에 배치된 Widget 인스턴스 1개. 카드 전체가 @dnd-kit sortable 드래그
 * 대상이며(활성화에 8px 이동 임계값을 두어 내부 버튼 클릭과 충돌하지 않음),
 * 카드 모서리에 떠있는 배지형 버튼으로 크기 조절/숨기기를 제공한다.
 * Widget 자체 컴포넌트는 Widget Registry에서 조회하며 하드코딩하지 않는다.
 */
export function WidgetCard({ instance, siteId, span, maxSpan, onHide, onCycleSize, onSettingsChange }: WidgetCardProps) {
  const def = getWidgetDefinition(instance.widgetId)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.instanceId })

  if (!def) return null

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const Component = def.component

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(SPAN_CLASS[span] ?? 'col-span-1', isDragging && 'opacity-50 shadow-lg', 'group relative cursor-grab touch-none active:cursor-grabbing')}
    >
      <div className="pointer-events-none absolute -top-2 -right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {maxSpan > 1 && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onCycleSize(instance.instanceId)
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="위젯 크기 조절"
            title="크기 조절"
          >
            {span >= maxSpan ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onHide(instance.instanceId)
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-red-50 hover:text-red-500"
          aria-label="위젯 숨기기"
          title="위젯 숨기기"
        >
          <X size={12} />
        </button>
      </div>
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
