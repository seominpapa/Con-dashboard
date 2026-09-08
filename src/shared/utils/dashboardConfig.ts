interface WidgetConfig {
  widgetId: string
  instanceId: string
  hidden?: boolean
  settings?: Record<string, unknown>
}

interface ClientDashboardConfig {
  desktopOrder: WidgetConfig[]
  mobileOrder: WidgetConfig[]
  activeSiteId: string | null
}

export function mergeWidgetSettings<T extends ClientDashboardConfig>(config: T, instanceId: string, patch: Record<string, unknown>): T {
  const merge = (widgets: WidgetConfig[]) =>
    widgets.map((widget) =>
      widget.instanceId === instanceId ? { ...widget, settings: { ...widget.settings, ...patch } } : widget
    )
  return { ...config, desktopOrder: merge(config.desktopOrder), mobileOrder: merge(config.mobileOrder) }
}

export function normalizeDashboardConfig(value: unknown): { widgets: WidgetConfig[]; activeSiteId?: string } {
  if (!value || typeof value !== 'object') throw new Error('dashboard config가 올바르지 않습니다')
  const input = value as Record<string, unknown>
  if (!Array.isArray(input.widgets) || input.widgets.length > 100) throw new Error('widgets가 올바르지 않습니다')

  const widgets = input.widgets.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('widget이 올바르지 않습니다')
    const widget = value as Record<string, unknown>
    if (typeof widget.widgetId !== 'string' || !widget.widgetId || widget.widgetId.length > 100) throw new Error('widgetId가 올바르지 않습니다')
    if (typeof widget.instanceId !== 'string' || !widget.instanceId || widget.instanceId.length > 150) throw new Error('instanceId가 올바르지 않습니다')
    if (widget.hidden !== undefined && typeof widget.hidden !== 'boolean') throw new Error('hidden이 올바르지 않습니다')
    if (widget.settings !== undefined) {
      if (!widget.settings || typeof widget.settings !== 'object' || Array.isArray(widget.settings)) throw new Error('settings가 올바르지 않습니다')
      if (JSON.stringify(widget.settings).length > 10_000) throw new Error('settings가 너무 큽니다')
    }
    return {
      widgetId: widget.widgetId,
      instanceId: widget.instanceId,
      ...(widget.hidden === undefined ? {} : { hidden: widget.hidden }),
      ...(widget.settings === undefined ? {} : { settings: widget.settings as Record<string, unknown> }),
    }
  })

  if (input.activeSiteId !== undefined && (typeof input.activeSiteId !== 'string' || input.activeSiteId.length > 150)) {
    throw new Error('activeSiteId가 올바르지 않습니다')
  }
  return { widgets, ...(input.activeSiteId ? { activeSiteId: input.activeSiteId } : {}) }
}
