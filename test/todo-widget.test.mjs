import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('todo query path stays constant because the API returns the full todo list', () => {
  const source = readFileSync(new URL('../src/client/widgets/TodoWidget.tsx', import.meta.url), 'utf8')

  assert.match(source, /useWidgetData<TodoItem\[]>\('\/api\/todos',\s*0\s*\)/)
  assert.doesNotMatch(source, /useMemo|dayKey|\?date=/)
})

test('todo refreshes only on initial load, explicit refresh, or after completion', () => {
  const source = readFileSync(new URL('../src/client/widgets/TodoWidget.tsx', import.meta.url), 'utf8')
  const registry = readFileSync(new URL('../src/client/widgets/registry.ts', import.meta.url), 'utf8')

  assert.match(source, /useWidgetData<TodoItem\[]>\('\/api\/todos',\s*0\s*\)/)
  assert.match(source, /onRefresh=\{refresh\}/)
  assert.match(source, /await api\.patch\([\s\S]+?\)\s*\n\s*refresh\(\)/)
  assert.match(registry, /id: 'todo',[\s\S]*?refreshInterval: 0,/)
})
