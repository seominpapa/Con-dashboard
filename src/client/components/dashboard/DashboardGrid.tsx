import { useCallback, useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { WidgetCard, MAX_COLUMNS, MAX_ROWS } from './WidgetCard'
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
import { mergeWidgetSettings } from '../../../shared/utils/dashboardConfig'
import type { WidgetDefinition, WidgetSize } from '../../../shared/types/widget'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** settings.span(너비)·settings.rows(높이)를 registry의 min/max 안으로 정규화한다. */
function widgetSize(w: DashboardWidgetInstance, def: WidgetDefinition): WidgetSize {
  const span = typeof w.settings?.span === 'number' ? w.settings.span : def.defaultSize.w
  const rows = typeof w.settings?.rows === 'number' ? w.settings.rows : def.defaultSize.h
  return {
    w: clamp(span, Math.min(def.minSize.w, MAX_COLUMNS), Math.min(def.maxSize.w, MAX_COLUMNS)),
    h: clamp(rows, Math.min(def.minSize.h, MAX_ROWS), Math.min(def.maxSize.h, MAX_ROWS)),
  }
}

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
    dashboardRepository.save(loaded)
    setConfig(loaded)
    syncDashboardConfigToServer(loaded)
  }, [])

  const persist = useCallback((next: DashboardConfig) => {
    setConfig(next)
    dashboardRepository.save(next)
    syncDashboardConfigToServer(next)
  }, [])

  useEffect(() => {
    if (sitesLoading || !config || config.activeSiteId === activeSiteId || (sites.length > 0 && !activeSiteId)) return
    persist({ ...config, activeSiteId: activeSiteId ?? null })
  }, [activeSiteId, config, persist, sites, sitesLoading])

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

  function handleResize(instanceId: string, size: WidgetSize) {
    if (!config) return
    persist(mergeWidgetSettings(config, instanceId, { span: size.w, rows: size.h }))
  }

  function handleSettingsChange(instanceId: string, settings: Record<string, unknown>) {
    if (!config) return
    persist(mergeWidgetSettings(config, instanceId, settings))
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
          아직 등록된 현장이 없습니다. 현장환경 위젯(건설날씨/대기질)을 이용하려면 상단 현장 선택에서 현장을 먼저 등록하세요.
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
          <div className="grid grid-cols-1 gap-4 md:auto-rows-[minmax(12rem,auto)] md:grid-cols-2 xl:grid-cols-3">
            {visible.map((w) => {
              const def = getWidgetDefinition(w.widgetId)!
              return (
                <WidgetCard
                  key={w.instanceId}
                  instance={w}
                  siteId={activeSiteId ?? ''}
                  size={widgetSize(w, def)}
                  minSize={def.minSize}
                  maxSize={def.maxSize}
                  onHide={handleHide}
                  onResize={handleResize}
                  onSettingsChange={handleSettingsChange}
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
