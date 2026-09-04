import { useCallback, useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { WidgetCard } from './WidgetCard'
import { WidgetPicker } from './WidgetPicker'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useSites } from '../../context/SiteContext'
import { getWidgetDefinition } from '../../widgets/registry'
import {
  dashboardRepository,
  createDefaultConfig,
  syncDashboardConfigToServer,
  type DashboardConfig,
  type DashboardWidgetInstance,
} from '../../lib/dashboardRepository'

/**
 * 기획 1, 2, 24번 핵심: PC 2~4열 / 태블릿 2열 / 모바일 1열 반응형 그리드,
 * 드래그&드롭 순서변경, 위젯 추가/제거/숨기기/리사이즈, 데스크톱/모바일
 * 배치 순서를 별도로 저장. DashboardRepository 인터페이스(현재 localStorage
 * 구현체)를 통해서만 영속화하므로 향후 DB 구현체로 교체해도 이 컴포넌트는
 * 변경할 필요가 없다.
 */
export function DashboardGrid() {
  const [config, setConfig] = useState<DashboardConfig | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const isMobile = useIsMobile()
  const { activeSiteId, sites, loading: sitesLoading } = useSites()

  useEffect(() => {
    const loaded = dashboardRepository.load() ?? createDefaultConfig()
    setConfig(loaded)
  }, [])

  const persist = useCallback((next: DashboardConfig) => {
    setConfig(next)
    dashboardRepository.save(next)
    syncDashboardConfigToServer(next)
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const orderKey: 'mobileOrder' | 'desktopOrder' = isMobile ? 'mobileOrder' : 'desktopOrder'

  function handleDragEnd(event: DragEndEvent) {
    if (!config) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const order = config[orderKey]
    const oldIndex = order.findIndex((w) => w.instanceId === active.id)
    const newIndex = order.findIndex((w) => w.instanceId === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const nextOrder = arrayMove(order, oldIndex, newIndex)
    persist({ ...config, [orderKey]: nextOrder })
  }

  function handleHide(instanceId: string) {
    if (!config) return
    const next: DashboardConfig = {
      ...config,
      desktopOrder: config.desktopOrder.map((w) => (w.instanceId === instanceId ? { ...w, hidden: true } : w)),
      mobileOrder: config.mobileOrder.map((w) => (w.instanceId === instanceId ? { ...w, hidden: true } : w)),
    }
    persist(next)
  }

  function handleAdd(widgetId: string) {
    if (!config) return
    const instanceId = `${widgetId}-${Date.now()}`
    const newInstance: DashboardWidgetInstance = { widgetId, instanceId }
    persist({
      ...config,
      desktopOrder: [...config.desktopOrder, newInstance],
      mobileOrder: [...config.mobileOrder, newInstance],
    })
    setPickerOpen(false)
  }

  function handleCycleSize(instanceId: string) {
    if (!config) return
    const next: DashboardConfig = {
      ...config,
      desktopOrder: config.desktopOrder.map((w) => {
        if (w.instanceId !== instanceId) return w
        const def = getWidgetDefinition(w.widgetId)
        const maxSpan = def?.maxSize.w ?? 1
        const current = (w.settings?.span as number) ?? def?.defaultSize.w ?? 1
        const nextSpan = current >= maxSpan ? 1 : current + 1
        return { ...w, settings: { ...w.settings, span: nextSpan } }
      }),
    }
    persist(next)
  }

  if (!config || sitesLoading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">불러오는 중...</div>
  }

  const visible = config[orderKey].filter((w) => !w.hidden && getWidgetDefinition(w.widgetId))
  const activeWidgetIds = config.desktopOrder.filter((w) => !w.hidden).map((w) => w.widgetId)

  return (
    <section id="dashboard-grid" aria-label="위젯 대시보드">
      {sites.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          아직 등록된 현장이 없습니다. 현장환경 위젯(건설날씨/대기질/오늘의 현장)을 이용하려면 상단 현장 선택에서 현장을 먼저 등록하세요.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">내 대시보드</h2>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <Plus size={14} /> 위젯 추가
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((w) => w.instanceId)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((w) => {
              const def = getWidgetDefinition(w.widgetId)!
              const span = Math.min((w.settings?.span as number) ?? def.defaultSize.w, def.maxSize.w)
              return (
                <WidgetCard
                  key={w.instanceId}
                  instance={w}
                  siteId={activeSiteId ?? ''}
                  span={span}
                  maxSpan={def.maxSize.w}
                  onHide={handleHide}
                  onCycleSize={handleCycleSize}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {visible.length === 0 && (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 text-center text-sm text-slate-400">
          <p>표시할 위젯이 없습니다.</p>
          <button onClick={() => setPickerOpen(true)} className="text-blue-600 hover:underline">
            위젯 추가하기
          </button>
        </div>
      )}

      <WidgetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} activeWidgetIds={activeWidgetIds} onAdd={handleAdd} />
    </section>
  )
}
