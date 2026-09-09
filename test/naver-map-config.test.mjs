import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
after(() => vite.close())

async function setup(t, userId = 'admin') {
  const { default: routes } = await vite.ssrLoadModule('/src/worker/routes/naver-map.ts')
  const { default: admin } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
  sqlite.exec("INSERT INTO users(id,email,name,google_id) VALUES('admin','test@example.test','Test','test'); INSERT INTO sites(id,user_id,name,address,latitude,longitude,kma_nx,kma_ny) VALUES('site','admin','현장','서울',37.5,127,60,127)")
  t.after(() => sqlite.close())
  const DB = { prepare(sql) {
    const bound = (...args) => ({
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }),
    })
    return { ...bound(), bind: bound }
  } }
  const env = { DB, AUTH_SECRET: 's'.repeat(32), NAVER_DYNAMIC_MAP_CLIENT_ID: 'dynamic123', NAVER_MAP_CLIENT_ID: 'geocode123', NAVER_MAP_CLIENT_SECRET: 'mustneverleak' }
  const app = new Hono()
  app.use('*', async (c, next) => { if (userId) c.set('currentUser', { id: userId }); await next() })
  app.route('/map', routes)
  app.route('/admin', admin)
  return { app, env, sqlite }
}

test('map configuration returns only public app ID and owned site; response is never cached', async (t) => {
  const { app, env } = await setup(t)
  const response = await app.request('/map?siteId=site', undefined, env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await response.json()).data, { clientId: 'dynamic123', site: { id: 'site', name: '현장', latitude: 37.5, longitude: 127 } })
})

test('map configuration requires authentication and site ownership', async (t) => {
  for (const [user, status] of [[null, 401], ['other', 404]]) {
    const { app, env } = await setup(t, user)
    assert.equal((await app.request('/map?siteId=site', undefined, env)).status, status)
  }
})

test('missing dedicated app does not reuse geocoding credentials, bad coordinates are rejected', async (t) => {
  const { app, env, sqlite } = await setup(t)
  const missing = await app.request('/map?siteId=site', undefined, { ...env, NAVER_DYNAMIC_MAP_CLIENT_ID: undefined })
  assert.equal(missing.status, 503)
  assert.match((await missing.json()).message, /Dynamic Map/)
  sqlite.prepare('UPDATE sites SET latitude=? WHERE id=?').run(Infinity, 'site')
  assert.equal((await app.request('/map?siteId=site', undefined, env)).status, 400)
})

test('registration validates public ID only, does not call Geocoding and reports browser verification required', async (t) => {
  const { app, env, sqlite } = await setup(t)
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No server API validation allowed') })
  const request = (credential) => app.request('/admin/naver_dynamic_map/connect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }),
  }, env)
  for (const invalid of [{ clientId: 'bad&callback=x' }, { clientId: 'x'.repeat(129) }, { clientId: 'valid123', clientSecret: 'notallowed' }]) {
    assert.equal((await request(invalid)).status, 400)
  }
  const registered = await request({ clientId: 'dbdynamic456' })
  assert.equal(registered.status, 200)
  assert.match((await registered.json()).data.testResult.message, /브라우저/)
  assert.equal(sqlite.prepare("SELECT last_success_at FROM integrations WHERE provider='naver_dynamic_map'").get().last_success_at, null)
  assert.equal((await (await app.request('/map?siteId=site', undefined, env)).json()).data.clientId, 'dbdynamic456')
  const checked = await app.request('/admin/naver_dynamic_map/test', { method: 'POST' }, env)
  assert.match((await checked.json()).data.testResult.message, /브라우저/)
})

test('map config rate limit blocks excessive requests', async (t) => {
  const { app, env } = await setup(t)
  for (let i = 0; i < 60; i++) assert.equal((await app.request('/map?siteId=site', undefined, env)).status, 200)
  const limited = await app.request('/map?siteId=site', undefined, env)
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
})
