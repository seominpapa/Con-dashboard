import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : [path]
  })
}

test('oil and Opinet surfaces are completely removed', () => {
  const paths = [
    ...sourceFiles(join(root, 'src')),
    join(root, 'README.md'),
    join(root, '.env.example'),
    join(root, 'migrations/0001_initial_schema.sql'),
  ]
  const remaining = paths.filter((path) => /opinet|oilPrice|oil-prices|OilPrice|OilKind|유가/i.test(readFileSync(path, 'utf8')))

  assert.deepEqual(remaining, [])
  assert.equal(existsSync(join(root, 'src/worker/providers/oil')), false)
  assert.doesNotMatch(readFileSync(join(root, 'src/worker/cache/memoryCache.ts'), 'utf8'), /\boil\s*:/)
  assert.doesNotMatch(readFileSync(join(root, 'migrations/0001_initial_schema.sql'), 'utf8'), /pref_type[^\n]*\boil\b/)
  assert.match(readFileSync(join(root, 'migrations/0005_remove_opinet.sql'), 'utf8'), /DELETE FROM integrations WHERE provider = 'opinet'/)
})
