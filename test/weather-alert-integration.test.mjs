import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { default: routes } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
const weather = await vite.ssrLoadModule('/src/worker/providers/weather/index.ts')
after(() => vite.close())
const site = { id: 'test', address: '서울특별시 중구', kmaNx: 60, kmaNy: 127 }
const warningCredential = randomUUID()

function setup(t) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
  t.after(() => sqlite.close())
  const DB = { prepare(sql) {
    const bound = (...args) => ({
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }),
    })
    return { ...bound(), bind: bound }
  } }
  const env = { DB, AUTH_SECRET: 's'.repeat(32), KMA_SERVICE_KEY: 'forecast-only-test' }
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('currentUser', { id: 'admin' }); await next() })
  app.route('/', routes)
  return { env, app, sqlite }
}

test('weather warnings have their own registration and test endpoint, accepting no active warnings', async (t) => {
  const { env, app, sqlite } = setup(t)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input)
    calls.push(url)
    return new Response(JSON.stringify({ response: { header: { resultCode: '03' } } }))
  })
  const result = await app.request('/kma_alert/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: { apiKey: warningCredential }, expiresAt: '2028-09-09' }),
  }, env)
  assert.equal(result.status, 200)
  assert.match(calls[0].pathname, /WthrWrnInfoService\/getWthrWrnList$/)
  assert.equal(calls[0].searchParams.get('serviceKey'), warningCredential)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM integrations WHERE provider=?').get('kma').n, 0)
  const provider = await weather.getWeatherAlertProvider(env)
  assert.deepEqual(await provider.getAlerts(site), [])
  assert.equal(calls.at(-1).searchParams.get('serviceKey'), warningCredential)
  const rows = (await (await app.request('/', undefined, env)).json()).data
  const row = rows.find((r) => r.provider === 'kma_alert')
  assert.equal(row.dbConfigured, true)
  assert.equal(row.expiresAt, '2028-09-09')
})

test('warning ENV key is independent; legacy forecast key remains a documented fallback', async (t) => {
  const { env, app } = setup(t)
  const rows = (await (await app.request('/', undefined, env)).json()).data
  assert.equal(rows.find((row) => row.provider === 'kma_alert').status, 'DISCONNECTED', 'forecast key availability does not prove warning API access')
  const keys = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    keys.push(new URL(input).searchParams.get('serviceKey'))
    return new Response(JSON.stringify({ response: { header: { resultCode: '03' } } }))
  })
  await (await weather.getWeatherAlertProvider({ ...env, KMA_ALERT_SERVICE_KEY: 'warning-env-test' })).getAlerts(site)
  await (await weather.getWeatherAlertProvider(env)).getAlerts(site)
  assert.deepEqual(keys, ['warning-env-test', 'forecast-only-test'])
})

test('rejected warning credentials are not stored or substituted with forecast credentials', async (t) => {
  const { env, app, sqlite } = setup(t)
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }))
  const result = await app.request('/kma_alert/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: { apiKey: warningCredential } }),
  }, env)
  assert.equal(result.status, 400)
  assert.match((await result.json()).message, /기상특보/)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM integrations').get().n, 0)
})
