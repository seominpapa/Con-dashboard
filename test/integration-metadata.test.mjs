import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { default: routes } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
const { requireAdmin, requireSameOriginMutation } = await vite.ssrLoadModule('/src/worker/middleware/auth.ts')
after(() => vite.close())

function setup(t, user = { id: 'admin', role: 'ADMIN', status: 'APPROVED' }) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
  sqlite.prepare(`INSERT INTO integrations
    (id,provider,type,status,encrypted_credential,metadata,connected_at,last_checked_at,last_success_at,last_error)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('intg1', 'kma', 'public_api', 'ERROR', 'opaque-encrypted-test-value',
      JSON.stringify({ expiresAt: '2026-01-01', custom: 'preserve' }), '2026-01-01', '2026-09-09', '2026-09-08', 'upstream failed')
  const DB = { prepare(sql) {
    const bound = (...args) => ({
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }),
    })
    return { ...bound(), bind: bound }
  } }
  t.after(() => sqlite.close())
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('metadata update must not call provider') })
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('currentUser', user); await next() })
  app.use('*', requireAdmin, requireSameOriginMutation)
  app.route('/', routes)
  const request = (body, provider = 'kma', origin = 'https://dashboard.test') => app.request(`https://dashboard.test/${provider}/metadata`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
  }, { DB, AUTH_SECRET: 's'.repeat(32) })
  const list = async (extraEnv = {}) => (await (await app.request('https://dashboard.test/', undefined, { DB, AUTH_SECRET: 's'.repeat(32), ...extraEnv })).json()).data
  return { sqlite, request, list, app, DB }
}

test('expiry and memo can be edited without credentials or a provider call, preserving connection fields', async (t) => {
  const { sqlite, request, list } = setup(t)
  const before = sqlite.prepare('SELECT * FROM integrations WHERE provider=?').get('kma')
  assert.equal((await request({ expiresAt: '2028-09-09', memo: '  특보 별도 승인 필요  ' })).status, 200)
  const after = sqlite.prepare('SELECT * FROM integrations WHERE provider=?').get('kma')
  for (const key of ['encrypted_credential', 'connected_at', 'status', 'last_checked_at', 'last_success_at', 'last_error']) {
    assert.equal(after[key], before[key], key)
  }
  assert.equal(JSON.parse(after.metadata).custom, 'preserve')
  assert.equal(after.updated_by, 'admin')
  const row = (await list()).find((r) => r.provider === 'kma')
  assert.equal(row.expiresAt, '2028-09-09')
  assert.equal(row.memo, '특보 별도 승인 필요')
  assert.equal(row.noExpiry, false)
  assert.ok(!JSON.stringify(row).includes('opaque-encrypted'))
})

test('no expiry is distinct from unknown, and a memo-only update preserves expiry', async (t) => {
  const { request, list } = setup(t)
  assert.equal((await request({ noExpiry: true, expiresAt: null })).status, 200)
  let row = (await list()).find((r) => r.provider === 'kma')
  assert.equal(row.noExpiry, true)
  assert.equal(row.expiresAt, null)
  assert.equal(row.daysUntilExpiry, null)
  assert.equal(row.status, 'ERROR')
  assert.equal((await request({ memo: '<script>not executable</script>' })).status, 200)
  assert.equal((await list()).find((r) => r.provider === 'kma').noExpiry, true)
  assert.equal((await request({ expiresAt: '2028-09-09' })).status, 200)
  row = (await list()).find((r) => r.provider === 'kma')
  assert.equal(row.noExpiry, false)
  assert.equal(row.expiresAt, '2028-09-09')
  assert.equal((await request({ noExpiry: false, expiresAt: null, memo: '' })).status, 200)
  row = (await list()).find((r) => r.provider === 'kma')
  assert.equal(row.noExpiry, false)
  assert.equal(row.expiresAt, null)
  assert.equal(row.memo, '')
})

test('metadata can record a failed or not-yet-connected provider without pretending it is connected', async (t) => {
  const { request, list } = setup(t)
  assert.equal((await request({ memo: '승인 대기', noExpiry: true }, 'material_prices')).status, 200)
  const row = (await list()).find((r) => r.provider === 'material_prices')
  assert.equal(row.status, 'DISCONNECTED')
  assert.equal(row.dbConfigured, false)
  assert.equal(row.memo, '승인 대기')
  const envRow = (await list({ MATERIAL_PRICE_SERVICE_KEY: 'test-only' })).find((r) => r.provider === 'material_prices')
  assert.equal(envRow.status, 'DISCONNECTED', 'ENV credentials must not imply a successful price-service check')
  assert.equal(envRow.envFallbackAvailable, true, 'management-only rows must not mask ENV availability')
  assert.equal(envRow.lastCheckedAt, null)
})

test('replacing credentials preserves previously saved management information', async (t) => {
  const { app, DB, request, list } = setup(t)
  assert.equal((await request({ memo: '다음 갱신 담당자 확인', noExpiry: true }, 'material_prices')).status, 200)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ header: { resultCode: '00' }, body: { items: [] } })))
  const response = await app.request('https://dashboard.test/material_prices/connect', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://dashboard.test' },
    body: JSON.stringify({ credential: { apiKey: 'test-only' } }),
  }, { DB, AUTH_SECRET: 's'.repeat(32) })
  assert.equal(response.status, 200)
  const row = (await list()).find((r) => r.provider === 'material_prices')
  assert.equal(row.status, 'CONNECTED')
  assert.equal(row.memo, '다음 갱신 담당자 확인')
  assert.equal(row.noExpiry, true)
})

test('metadata writes are rate limited', async (t) => {
  const { request } = setup(t)
  for (let i = 0; i < 30; i++) assert.equal((await request({ memo: `note ${i}` })).status, 200)
  assert.equal((await request({ memo: 'limited' })).status, 429)
})

test('metadata rejects malformed dates, conflicting modes, long notes and credential injection', async (t) => {
  const { sqlite, request } = setup(t)
  const before = sqlite.prepare('SELECT * FROM integrations').all()
  for (const body of [null, [], {}, { expiresAt: '2026-02-30' }, { noExpiry: 'yes' },
    { noExpiry: true, expiresAt: '2028-01-01' }, { memo: 'a'.repeat(2001) }, { memo: 3 },
    { memo: 'test', credential: { apiKey: 'test-only' } }, { status: 'CONNECTED' }]) {
    assert.equal((await request(body)).status, 400, JSON.stringify(body).slice(0, 80))
  }
  assert.equal((await request({ memo: 'test' }, 'unknown')).status, 400)
  assert.deepEqual(sqlite.prepare('SELECT * FROM integrations').all(), before)
})

test('metadata endpoint enforces admin authorization and same-origin requests', async (t) => {
  const { request } = setup(t, { id: 'user', role: 'USER', status: 'APPROVED' })
  assert.equal((await request({ memo: 'test' })).status, 403)
  const admin = setup(t)
  assert.equal((await admin.request({ memo: 'test' }, 'kma', 'https://other.test')).status, 403)
})
