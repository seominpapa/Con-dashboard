import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { getLocalDayKey } = await vite.ssrLoadModule('/src/client/widgets/ScheduleWidget.tsx')
after(() => vite.close())

test('schedule query range is stable across widget rerenders', () => {
  const source = readFileSync(new URL('../src/client/widgets/ScheduleWidget.tsx', import.meta.url), 'utf8')

  assert.match(source, /useMemo\(\(\) => \{[\s\S]+?\}, \[dayKey\]\)/)
  assert.doesNotMatch(source, /const from = new Date\(\)\.toISOString\(\)/)
})

test('schedule query range changes only when the local date changes', () => {
  const morning = new Date(2026, 8, 8, 9, 0)
  const evening = new Date(2026, 8, 8, 23, 59)
  const nextDay = new Date(2026, 8, 9, 0, 1)

  assert.equal(getLocalDayKey(morning), getLocalDayKey(evening))
  assert.notEqual(getLocalDayKey(evening), getLocalDayKey(nextDay))
})

test('schedule refreshes only on initial load or an explicit widget refresh', () => {
  const source = readFileSync(new URL('../src/client/widgets/ScheduleWidget.tsx', import.meta.url), 'utf8')
  const registry = readFileSync(new URL('../src/client/widgets/registry.ts', import.meta.url), 'utf8')

  assert.match(source, /useWidgetData<ScheduleEvent\[]>\([\s\S]+?,\s*0\s*\)/)
  assert.match(source, /onRefresh=\{refresh\}/)
  assert.match(registry, /id: 'calendar',[\s\S]*?refreshInterval: 0,/)
})
