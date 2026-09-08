import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const {
  hasBriefingData,
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

test('legacy empty daily briefing is discarded once while a useful success cache is preserved', async () => {
  const legacyEmpty = {
    id: 'brief-empty',
    status: 'success',
    structured: {
      summary: '오늘 대시보드에 등록된 데이터가 없습니다. 현장 정보와 대시보드 위젯을 확인해 주세요.',
      priorityItems: [],
      scheduleItems: [],
      riskItems: [],
      marketItems: [],
      informationItems: [],
    },
  }
  let deletedId = null
  const legacyRepo = {
    findByUserAndDate: async () => legacyEmpty,
    deleteErrorByUserAndDate: async () => {},
    deleteLegacyEmptySuccessById: async (id) => { deletedId = id },
  }
  assert.equal(await loadSuccessfulCachedBriefing(legacyRepo, 'user-1', '2026-09-08'), null)
  assert.equal(deletedId, 'brief-empty')

  const useful = {
    ...legacyEmpty,
    id: 'brief-useful',
    structured: { ...legacyEmpty.structured, summary: '오늘은 강풍에 유의하세요.' },
  }
  const usefulRepo = {
    findByUserAndDate: async () => useful,
    deleteErrorByUserAndDate: async () => {},
    deleteLegacyEmptySuccessById: async () => { throw new Error('must not delete useful success') },
  }
  assert.equal(await loadSuccessfulCachedBriefing(usefulRepo, 'user-1', '2026-09-08'), useful)
})

test('briefing generation only proceeds when normalized widget context contains data', () => {
  const metadataOnly = {
    generatedAt: '2026-09-08T00:00:00.000Z',
    user: { name: '관리자' },
    site: { id: 'site-1', name: '현장', address: '서울' },
  }
  assert.equal(hasBriefingData(metadataOnly), false)
  assert.equal(hasBriefingData({ ...metadataOnly, weather: { data: {}, risk: {}, freshness: 'fresh' } }), true)
  assert.equal(hasBriefingData({ ...metadataOnly, calendar: { todayEvents: [], freshness: 'fresh' } }), true)
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
  const lease = source.indexOf('consumeFixedWindow(leaseKey, 1, 300)')
  const quota = source.indexOf('ai_briefing_generate_rate:')
  const generate = source.indexOf('llm.generateBriefing')
  assert.ok(lease >= 0, 'an atomic five-minute generation lease is acquired')
  assert.ok(lease < quota && quota < generate, 'only the lease holder consumes quota and calls the LLM')
  assert.match(source, /status: 'generating'/)
  assert.match(source, /finally\s*\{[\s\S]*delete\(leaseKey\)/)
})

test('AI briefing widget exposes transport errors from the shared data hook', () => {
  const source = readFileSync(new URL('../src/client/widgets/AiBriefingWidget.tsx', import.meta.url), 'utf8')
  assert.match(source, /data, loading, error, updatedAt, refresh/)
  assert.match(source, /error=\{error\}/)
})
