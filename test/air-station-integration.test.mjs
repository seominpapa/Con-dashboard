import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { default: routes } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
const { getAirQualityProvider } = await vite.ssrLoadModule('/src/worker/providers/air-quality/index.ts')
after(() => vite.close())

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
  const env = { DB, AUTH_SECRET: 's'.repeat(32), AIRKOREA_SERVICE_KEY: 'measure-test' }
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('currentUser', { id: 'admin' }); await next() })
  app.route('/', routes)
  return { env, app, sqlite }
}
const stationCredential = randomUUID()
const connect = { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: { apiKey: stationCredential }, noExpiry: true, memo: '측정소 전용' }) }

test('station registration tests only the station service; runtime uses separate keys', async (t) => {
  const { env, app } = setup(t)
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-09T03:00:00Z') })
  const calls = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input)
    calls.push(url)
    const items = url.pathname.includes('getMsrstnList')
      ? [{ stationName: '관측소', addr: '서울특별시 중구', dmX: '37.57', dmY: '126.98' }]
      : [{ dataTime: '2026-09-09 12:00', pm10Value: '10', pm25Value: '5', o3Value: '0.02', khaiValue: '30' }]
    return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items, totalCount: 1 } } }))
  })
  const response = await app.request('/airkorea_station/connect', connect, env)
  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  assert.match(calls[0].pathname, /MsrstnInfoInqireSvc\/getMsrstnList$/)
  assert.equal(calls[0].searchParams.get('serviceKey'), stationCredential)
  const rows = (await (await app.request('/', undefined, env)).json()).data
  const row = rows.find((r) => r.provider === 'airkorea_station')
  assert.equal(row.noExpiry, true)
  assert.equal(row.memo, '측정소 전용')
  assert.equal(JSON.stringify(rows).includes(stationCredential), false)
  const provider = await getAirQualityProvider({ ...env, AIRKOREA_STATION_SERVICE_KEY: 'lower-priority-env' })
  await provider.getCurrentAirQuality({ id: 'site', address: '서울특별시 중구', latitude: 37.5663, longitude: 126.9779 })
  assert.equal(calls.at(-2).searchParams.get('serviceKey'), stationCredential)
  assert.equal(calls.at(-1).searchParams.get('serviceKey'), 'measure-test')
})

test('station rejection is not saved; station ENV key does not replace measurement key', async (t) => {
  const { env, app, sqlite } = setup(t)
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }))
  const response = await app.request('/airkorea_station/connect', connect, env)
  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /측정소/)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM integrations').get().n, 0)
  const keys = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    keys.push(new URL(input).searchParams.get('serviceKey'))
    return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [], totalCount: 0 } } }))
  })
  const provider = await getAirQualityProvider({ ...env, AIRKOREA_STATION_SERVICE_KEY: 'station-env' })
  await assert.rejects(provider.getCurrentAirQuality({ id: 'site', address: '서울특별시 중구', latitude: 37.56, longitude: 126.98 }))
  assert.deepEqual(keys, ['station-env', 'measure-test'])
})

test('unreadable optional station credential does not block valid measurement and station ENV keys', async (t) => {
  const { env } = setup(t)
  const DB = { prepare() { return { bind(provider) { return { first: async () => provider === 'airkorea_station'
    ? { encrypted_credential: 'broken-ciphertext' } : null } } } } }
  const keys = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    keys.push(new URL(input).searchParams.get('serviceKey'))
    return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [], totalCount: 0 } } }))
  })
  const provider = await getAirQualityProvider({ ...env, DB, AIRKOREA_STATION_SERVICE_KEY: 'station-env' })
  await assert.rejects(provider.getCurrentAirQuality({ id: 'site', address: '서울특별시 중구', latitude: 37.56, longitude: 126.98 }))
  assert.deepEqual(keys, ['station-env', 'measure-test'])
})
