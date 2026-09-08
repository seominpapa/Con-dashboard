import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const {
  loadSuccessfulCachedBriefing,
  parseStructuredOutput,
  selectBriefingSite,
} = await vite.ssrLoadModule('/src/worker/briefing/BriefingService.ts')
const { selectedWidgetStrings } = await vite.ssrLoadModule('/src/worker/briefing/BriefingContextBuilder.ts')
const { DashboardConfigRepository } = await vite.ssrLoadModule('/src/worker/repositories/DashboardConfigRepository.ts')
after(() => vite.close())

test('briefing selects the configured active site and falls back to the first site', () => {
  const sites = [{ id: 'site-1' }, { id: 'site-2' }]
  assert.equal(selectBriefingSite(sites, 'site-2')?.id, 'site-2')
  assert.equal(selectBriefingSite(sites, 'missing')?.id, 'site-1')
  assert.equal(selectBriefingSite([], 'site-2'), null)
})

test('failed daily briefings are deleted and retried while successful briefings are cached', async () => {
  let deleted = 0
  const errorRepo = {
    findByUserAndDate: async () => ({ status: 'error' }),
    deleteErrorByUserAndDate: async () => { deleted += 1 },
  }
  assert.equal(await loadSuccessfulCachedBriefing(errorRepo, 'user-1', '2026-09-08'), null)
  assert.equal(deleted, 1)

  const success = { status: 'success', id: 'brief-1' }
  const successRepo = {
    findByUserAndDate: async () => success,
    deleteErrorByUserAndDate: async () => { throw new Error('must not delete success') },
  }
  assert.equal(await loadSuccessfulCachedBriefing(successRepo, 'user-1', '2026-09-08'), success)
})

test('structured briefing output rejects invalid JSON shapes instead of caching them', () => {
  const valid = {
    summary: '오늘 요약',
    priorityItems: [{ level: 'high', title: '강풍', reason: '확인 필요', sourceWidgets: ['weather'] }],
    scheduleItems: [],
    riskItems: [],
    marketItems: [],
    informationItems: [],
  }
  assert.deepEqual(parseStructuredOutput(JSON.stringify(valid)), valid)
  assert.throws(() => parseStructuredOutput('{"summary":3}'), /응답 형식/)
  assert.throws(
    () => parseStructuredOutput(JSON.stringify({ ...valid, priorityItems: [{ level: 'urgent' }] })),
    /응답 형식/,
  )
})

test('dashboard repository keeps active widget settings for briefing context', async () => {
  const config = {
    activeSiteId: 'site-2',
    widgets: [
      { widgetId: 'law', instanceId: 'law-1', settings: { lawNames: ['건설산업기본법'] } },
      { widgetId: 'materialPrice', instanceId: 'material-1', settings: { materialKeys: ['cement'] } },
      { widgetId: 'weather', instanceId: 'weather-1', hidden: true },
    ],
  }
  const db = {
    prepare() {
      return { bind: () => ({ first: async () => ({ config_json: JSON.stringify(config) }) }) }
    },
  }
  assert.deepEqual(await new DashboardConfigRepository(db).getBriefingConfig('user-1'), {
    configured: true,
    activeSiteId: 'site-2',
    widgets: config.widgets.slice(0, 2),
  })
})

test('briefing context reads validated law and material selections from active widgets', () => {
  const widgets = [
    { widgetId: 'law', instanceId: 'law-1', settings: { lawNames: ['건설산업기본법', '', 3] } },
    { widgetId: 'materialPrice', instanceId: 'material-1', settings: { materialKeys: ['cement', 'unknown'] } },
  ]
  assert.deepEqual(selectedWidgetStrings(widgets, 'law', 'lawNames', ['기본법'], 20), ['건설산업기본법'])
  assert.deepEqual(selectedWidgetStrings(widgets, 'materialPrice', 'materialKeys', ['rebar'], 20), ['cement', 'unknown'])
  const source = readFileSync(new URL('../src/worker/briefing/BriefingContextBuilder.ts', import.meta.url), 'utf8')
  assert.match(source, /MockMaterialPriceProvider/)
  assert.match(source, /source === 'live' \? 'fresh' : 'stale'/)
})

test('briefing generation attempts are rate limited even when failures are not cached', () => {
  const source = readFileSync(new URL('../src/worker/briefing/BriefingService.ts', import.meta.url), 'utf8')
  assert.match(source, /ai_briefing_generate_rate:/)
  assert.match(source, /consumeFixedWindow/)
})
