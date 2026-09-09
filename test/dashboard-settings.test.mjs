import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after } from 'node:test'
import { createServer } from 'vite'

import { mergeWidgetSettings, normalizeDashboardConfig } from '../src/shared/utils/dashboardConfig.ts'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { migrateMaterialPriceWidget } = await vite.ssrLoadModule('/src/client/lib/dashboardRepository.ts')
after(() => vite.close())

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

test('dashboard sync never deletes the successful daily briefing cache', () => {
  const route = readFileSync(new URL('../src/worker/routes/dashboard.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(route, /DELETE FROM ai_briefings/)
  assert.doesNotMatch(route, /todayKeySeoul/)

  const grid = readFileSync(new URL('../src/client/components/dashboard/DashboardGrid.tsx', import.meta.url), 'utf8')
  assert.ok(grid.indexOf('setConfig(loaded)') < grid.indexOf('syncDashboardConfigToServer(loaded)'))
  assert.match(grid, /persist\(\{ \.\.\.config, activeSiteId: activeSiteId \?\? null \}\)/)
  assert.match(grid, /sites\.length > 0 && !activeSiteId/)
})

test('legacy material-price widgets are merged into market summary without losing its selection', () => {
  const summary = { widgetId: 'marketSummary', instanceId: 'summary-1' }
  const legacy = { widgetId: 'materialPrice', instanceId: 'materials-1', settings: { materialKeys: ['rebar', 'cement'] } }
  const migrated = migrateMaterialPriceWidget({ desktopOrder: [summary, legacy], mobileOrder: [legacy], activeSiteId: null })
  assert.deepEqual(migrated.desktopOrder, [{ ...summary, settings: { materialKeys: ['rebar', 'cement'] } }])
  assert.deepEqual(migrated.mobileOrder, [{ ...legacy, widgetId: 'marketSummary' }])
})
