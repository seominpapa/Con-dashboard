import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'
import { withWidgetSnapshot } from '../src/worker/cache/widgetSnapshot.ts'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { default: airRoutes } = await vite.ssrLoadModule('/src/worker/routes/air-quality.ts')
after(() => vite.close())

const now = new Date('2026-09-09T06:00:00Z')
beforeEach((t) => t.mock.timers.enable({ apis: ['Date'], now }))
const usable = (value) => Array.isArray(value) && value.length > 0
const offline = async () => { throw new Error('upstream secret must not leak') }
function setup(t) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
  t.after(() => sqlite.close())
  const db = { prepare(sql) { return { bind(...args) { return {
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => sqlite.prepare(sql).run(...args),
  } } } } }
  const run = (fetcher, scope = 'site-coordinates') => withWidgetSnapshot(db, 'widget:user:site', scope, 60_000, 120_000, fetcher, usable)
  const seed = (value) => sqlite.prepare('INSERT OR REPLACE INTO app_settings VALUES (?, ?, ?)').run('widget:user:site', value, now.toISOString())
  return { db, sqlite, run, seed }
}

test('fresh last-good data survives a separate helper call without upstream and preserves fetched time', async (t) => {
  const { run } = setup(t)
  const first = await run(async () => ['news'])
  t.mock.timers.tick(30_000)
  const second = await run(offline)
  assert.deepEqual(second.data, first.data)
  assert.equal(second.cached, true)
  assert.equal(second.stale, undefined)
  assert.equal(second.updatedAt, first.updatedAt)
})

test('expired TTL falls back on failure only within maximum age with original timestamp', async (t) => {
  const { run } = setup(t)
  const first = await run(async () => ['news'])
  t.mock.timers.tick(60_001)
  const second = await run(offline)
  assert.equal(second.stale, true)
  assert.equal(second.cached, true)
  assert.equal(second.updatedAt, first.updatedAt)
  assert.doesNotMatch(second.message, /secret/)
  t.mock.timers.tick(60_000)
  await assert.rejects(run(offline), /upstream/)
})

test('empty refresh never overwrites last-good snapshot; no snapshot returns real empty result', async (t) => {
  const { run, sqlite } = setup(t)
  const empty = await run(async () => [])
  assert.deepEqual(empty.data, [])
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM app_settings').get().count, 0)
  const first = await run(async () => ['news'])
  t.mock.timers.tick(60_001)
  const fallback = await run(async () => [])
  assert.equal(fallback.stale, true)
  assert.deepEqual(fallback.data, first.data)
  assert.equal(JSON.parse(sqlite.prepare('SELECT value FROM app_settings').get().value).updatedAt, first.updatedAt)
})

test('corrupt, expired, future, scope-mismatched and invalid data snapshots cannot restore', async (t) => {
  const { run, seed } = setup(t)
  const base = { scope: 'site-coordinates', data: ['news'], updatedAt: now.toISOString() }
  for (const value of ['not json', 'null', JSON.stringify({ ...base, updatedAt: 'nonsense' }),
    JSON.stringify({ ...base, updatedAt: new Date(+now - 120_001).toISOString() }),
    JSON.stringify({ ...base, updatedAt: new Date(+now + 1).toISOString() }),
    JSON.stringify({ ...base, scope: 'other site' }), JSON.stringify({ ...base, data: [] })]) {
    seed(value)
    await assert.rejects(run(offline), /upstream/)
  }
})

test('failed DB read and write cannot hide a successful upstream value', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const db = { prepare() { throw new Error('private DB detail') } }
  const result = await withWidgetSnapshot(db, 'key', 'scope', 1, 2, async () => ['live'], usable)
  assert.deepEqual(result.data, ['live'])
  assert.equal(result.source, 'live')
  assert.equal(console.warn.mock.calls.length, 2)
  assert.ok(console.warn.mock.calls.every(({ arguments: args }) => !args.join(' ').includes('private DB detail')))
})

test('snapshot usability is checked again on retrieval instead of extending observation age', async (t) => {
  const { db } = setup(t)
  const observation = { measuredAt: +now, pm10: 21 }
  const isRecent = (value) => value && Date.now() - value.measuredAt <= 20_000
  await withWidgetSnapshot(db, 'air', 'scope', 60_000, 120_000, async () => observation, isRecent)
  t.mock.timers.tick(20_001)
  await assert.rejects(withWidgetSnapshot(db, 'air', 'scope', 60_000, 120_000, offline, isRecent), /upstream/)
})

function airSetup(t) {
  const { db, sqlite } = setup(t)
  sqlite.prepare('INSERT INTO users (id,email,name,google_id) VALUES (?,?,?,?)').run('owner', 'owner@example.test', 'owner', 'owner')
  sqlite.prepare('INSERT INTO sites (id,user_id,name,address,latitude,longitude,kma_nx,kma_ny,airkorea_station_name) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('site', 'owner', '현장', '경기도 안성시', 37, 127.2, 60, 120, '안성')
  const env = { DB: db, AUTH_SECRET: 'a'.repeat(32), AIRKOREA_SERVICE_KEY: randomUUID() }
  const request = (userId = 'owner', runtime = env) => {
    const app = new Hono()
    app.use('*', async (c, next) => { c.set('currentUser', { id: userId }); await next() })
    app.route('/api/air-quality', airRoutes)
    return app.request('/api/air-quality?siteId=site', undefined, runtime)
  }
  const reading = { dataTime: '2026-09-09 15:00', pm10Value: '21', pm25Value: '9', o3Value: '0.02', khaiValue: '42', pm10Grade: '1', pm25Grade: '1', o3Grade: '1', khaiGrade: '1' }
  const live = () => new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [reading] } } }))
  return { sqlite, env, request, live }
}

test('air route reconnect restores a persisted observation and safely falls back across requests', async (t) => {
  const { request, live, sqlite } = airSetup(t)
  t.mock.method(globalThis, 'fetch', live)
  const initial = await (await request()).json()
  assert.equal(initial.data.stationName, '안성')
  t.mock.method(globalThis, 'fetch', offline)
  t.mock.timers.tick(60_000)
  const reconnected = await (await request()).json()
  assert.equal(reconnected.cached, true)
  assert.equal(reconnected.updatedAt, initial.updatedAt)
  t.mock.timers.tick(30 * 60_000)
  const fallback = await (await request()).json()
  assert.equal(fallback.stale, true)
  assert.equal(fallback.updatedAt, initial.updatedAt)
  assert.equal(fallback.data.measuredAt, initial.data.measuredAt)
  assert.doesNotMatch(JSON.stringify(fallback), /secret/)
  assert.equal((await request('other-user')).status, 404)
  sqlite.prepare('UPDATE sites SET latitude=? WHERE id=?').run(37.1, 'site')
  assert.equal((await request()).status, 502)
})

test('air route does not persist mock data or reuse a live snapshot when provider becomes unconfigured', async (t) => {
  const { request, live, sqlite, env } = airSetup(t)
  t.mock.method(globalThis, 'fetch', live)
  const runtime = { ...env, AIRKOREA_SERVICE_KEY: undefined }
  assert.equal((await (await request('owner', runtime)).json()).source, 'mock')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM app_settings').get().count, 0)
  await request()
  assert.equal((await (await request('owner', runtime)).json()).source, 'mock')
})
