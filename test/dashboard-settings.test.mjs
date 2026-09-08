import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { mergeWidgetSettings, normalizeDashboardConfig } from '../src/shared/utils/dashboardConfig.ts'

test('widget settings are merged immutably in desktop and mobile layouts', () => {
  const shared = { widgetId: 'law', instanceId: 'law-1', settings: { span: 2 } }
  const config = { desktopOrder: [shared], mobileOrder: [shared], activeSiteId: null }

  const next = mergeWidgetSettings(config, 'law-1', { lawNames: ['건설산업기본법'] })

  assert.deepEqual(next.desktopOrder[0].settings, { span: 2, lawNames: ['건설산업기본법'] })
  assert.deepEqual(next.mobileOrder[0].settings, { span: 2, lawNames: ['건설산업기본법'] })
  assert.deepEqual(config.desktopOrder[0].settings, { span: 2 })
})

test('dashboard config validation accepts widget settings and rejects malformed input', () => {
  assert.deepEqual(
    normalizeDashboardConfig({
      widgets: [{ widgetId: 'law', instanceId: 'law-1', settings: { lawNames: ['건설산업기본법'] } }],
      activeSiteId: 'site-1',
    }),
    {
      widgets: [{ widgetId: 'law', instanceId: 'law-1', settings: { lawNames: ['건설산업기본법'] } }],
      activeSiteId: 'site-1',
    }
  )

  assert.throws(() => normalizeDashboardConfig({ widgets: 'not-an-array' }), /widgets/)
  assert.throws(
    () => normalizeDashboardConfig({ widgets: [{ widgetId: 'law', instanceId: 'law-1', settings: { huge: 'x'.repeat(20_000) } }] }),
    /settings/
  )
})

test('dashboard sync invalidates a pre-config briefing only once', () => {
  const route = readFileSync(new URL('../src/worker/routes/dashboard.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(!previous\)/)
  assert.doesNotMatch(route, /JSON\.stringify\(previous\) !== JSON\.stringify\(body\)/)

  const grid = readFileSync(new URL('../src/client/components/dashboard/DashboardGrid.tsx', import.meta.url), 'utf8')
  assert.ok(grid.indexOf('setConfig(loaded)') < grid.indexOf('syncDashboardConfigToServer(loaded)'))
  assert.match(grid, /persist\(\{ \.\.\.config, activeSiteId: activeSiteId \?\? null \}\)/)
  assert.match(grid, /sites\.length > 0 && !activeSiteId/)
})
