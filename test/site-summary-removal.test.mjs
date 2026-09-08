import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const root = new URL('..', import.meta.url)

test('mock-only site summary backend and widget are removed', () => {
  assert.equal(existsSync(new URL('src/client/widgets/SiteSummaryWidget.tsx', root)), false)
  assert.equal(existsSync(new URL('src/worker/routes/site-summary.ts', root)), false)
  const providersDir = new URL('src/worker/providers/site-summary', root)
  assert.deepEqual(existsSync(providersDir) ? readdirSync(providersDir) : [], [])
  assert.equal(existsSync(new URL('src/shared/types/site-summary.ts', root)), false)

  const checked = [
    'src/client/lib/dashboardRepository.ts',
    'src/client/components/dashboard/DashboardGrid.tsx',
    'src/worker/index.ts',
    'src/worker/briefing/BriefingContextBuilder.ts',
    'src/worker/briefing/prompt.ts',
    'src/shared/types/index.ts',
  ]
  for (const path of checked) {
    assert.doesNotMatch(readFileSync(new URL(path, root), 'utf8'), /siteSummary|site-summary|오늘의 현장/, path)
  }
})
