import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
after(() => vite.close())
const { readConfig } = await vite.ssrLoadModule('/src/server/config.ts')
const { createNodeApp } = await vite.ssrLoadModule('/src/server/app.ts')
const { openSqliteDatabase } = await vite.ssrLoadModule('/src/server/sqlite.ts')
const { createSession, signSessionValue } = await vite.ssrLoadModule('/src/worker/auth/session.ts')

const env = { AUTH_SECRET: 'test-secret-with-more-than-thirty-two-characters', APP_BASE_URL: 'http://localhost:3000' }

test('Node config validates secrets, canonical origins and persistent storage', () => {
  const config = readConfig(env)
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.port, 3000)
  assert.equal(config.databasePath, 'data/dashboard.sqlite')
  assert.equal(config.bindings.APP_BASE_URL, env.APP_BASE_URL)
  assert.equal(readConfig({ ...env, APP_BASE_URL: 'https://dashboard.example.com/' }).bindings.APP_BASE_URL, 'https://dashboard.example.com')
  for (const APP_BASE_URL of ['', 'not-a-url', 'http://dashboard.example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?secret=1', 'https://example.com/#x']) {
    assert.throws(() => readConfig({ ...env, APP_BASE_URL }), /APP_BASE_URL/)
  }
  for (const APP_BASE_URL of ['http://127.0.0.1:3000', 'http://[::1]:3000', 'https://dashboard.example.com']) {
    assert.equal(readConfig({ ...env, APP_BASE_URL }).bindings.APP_BASE_URL, APP_BASE_URL)
  }
  for (const AUTH_SECRET of ['', 'short']) assert.throws(() => readConfig({ ...env, AUTH_SECRET }), /AUTH_SECRET/)
  for (const PORT of ['', '0', '-1', '65536', '3.5', '30x']) assert.throws(() => readConfig({ ...env, PORT }), /PORT/)
  for (const DATABASE_PATH of ['', ':memory:']) assert.throws(() => readConfig({ ...env, DATABASE_PATH }), /DATABASE_PATH/)
  assert.equal(readConfig({ ...env, PORT: '8080', DATABASE_PATH: '/data/dashboard.sqlite', OPENAI_API_KEY: 'server-only', UNRELATED_SECRET: 'omit-me' }).bindings.OPENAI_API_KEY, 'server-only')
  assert.equal('UNRELATED_SECRET' in readConfig({ ...env, UNRELATED_SECRET: 'omit-me' }).bindings, false)
})

function setup(t, origin = env.APP_BASE_URL) {
  const directory = mkdtempSync(join(tmpdir(), 'con-dashboard-node-test-'))
  const root = join(directory, 'dist')
  mkdirSync(join(root, 'assets'), { recursive: true })
  mkdirSync(join(root, 'static'), { recursive: true })
  mkdirSync(join(root, 'server'), { recursive: true })
  writeFileSync(join(root, 'index.html'), '<html>dashboard SPA</html>')
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("client")')
  writeFileSync(join(root, 'static', 'logo.svg'), '<svg/>')
  writeFileSync(join(root, 'server', 'index.js'), 'private server code')
  writeFileSync(join(root, '_worker.js'), 'private worker code')
  writeFileSync(join(root, 'assets', '.env'), 'private secret')
  writeFileSync(join(root, 'dashboard.sqlite'), 'private database')
  const database = openSqliteDatabase(join(directory, 'database.sqlite'), new URL('../migrations/', import.meta.url).pathname)
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  const bindings = { ...env, APP_BASE_URL: origin, DB: database.db }
  return { app: createNodeApp(bindings, root), bindings }
}

test('Node serves SPA deep links and public assets while isolating server files', async (t) => {
  const { app } = setup(t)
  assert.equal((await app.request('/healthz')).status, 200)
  for (const path of ['/', '/sites/site-1', '/admin/integrations/ai']) {
    const response = await app.request(path)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /dashboard SPA/)
  }
  assert.match(await (await app.request('/assets/app.js')).text(), /client/)
  assert.equal((await app.request('/static/logo.svg')).status, 200)
  assert.equal((await app.request('/assets/app.js', { method: 'HEAD' })).status, 200)
  for (const path of ['/assets/missing.js', '/missing.js', '/server/index.js', '/_worker.js', '/.env', '/assets/.env', '/assets/%2eenv', '/assets/%252eenv', '/dashboard.sqlite', '/migrations/0001_initial_schema.sql', '/assets/a%5c..%5c.env']) {
    const response = await app.request(path)
    assert.equal(response.status, 404, path)
    assert.doesNotMatch(await response.text(), /private|dashboard SPA/)
  }
})

test('Node forwards real authentication and uses configured HTTPS origin behind a proxy', async (t) => {
  const { app } = setup(t, 'https://dashboard.example.com')
  const unauthenticated = await app.request('/api/sites')
  assert.equal(unauthenticated.status, 401)
  assert.equal((await unauthenticated.json()).code, 'UNAUTHENTICATED')
  const allowed = await app.request('http://internal:3000/api/auth/logout', { method: 'POST', headers: { Origin: 'https://dashboard.example.com' } })
  assert.equal(allowed.status, 200)
  const denied = await app.request('http://internal:3000/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example.com' } })
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).code, 'INVALID_ORIGIN')
})

test('SQLite-backed authenticated API requests retain JSON 404 and database readiness failures are private', async (t) => {
  const { app, bindings } = setup(t)
  await bindings.DB.prepare('INSERT INTO users (id,email,name,google_id,role,status) VALUES (?,?,?,?,?,?)')
    .bind('node-user', 'node@example.test', 'Node user', 'node-google', 'USER', 'APPROVED').run()
  const session = await createSession(bindings.DB, 'node-user')
  const signed = await signSessionValue(session, env.AUTH_SECRET)
  const headers = { Cookie: `cd_session=${signed}` }
  assert.equal((await app.request('/api/sites', { headers })).status, 200)
  const missing = await app.request('/api/not-found', { headers })
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).status, 'error')
  const unhealthy = createNodeApp({ ...bindings, DB: { prepare() { throw new Error('private database detail') } } }, tmpdir())
  const health = await unhealthy.request('/healthz')
  assert.equal(health.status, 503)
  assert.doesNotMatch(await health.text(), /private database detail/)
})

for (const origin of ['http://localhost:3000', 'https://dashboard.example.com']) {
  test(`OAuth state, cookies, SQLite session and logout work at ${origin}`, async (t) => {
    const { bindings } = setup(t, origin)
    const runtime = { ...bindings, GOOGLE_CLIENT_ID: 'node-test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-google-secret', INITIAL_ADMIN_EMAIL: 'admin@example.test' }
    const app = createNodeApp(runtime, tmpdir())
    const calls = []
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      calls.push(String(url))
      if (String(url).includes('/token')) {
        assert.equal(new URLSearchParams(init.body).get('redirect_uri'), `${origin}/api/auth/google/callback`)
        return Response.json({ access_token: 'test-access', id_token: 'test-id' })
      }
      return Response.json({ sub: 'google-admin', email: 'admin@example.test', email_verified: true, name: 'Admin' })
    })
    const start = await app.request('http://internal:3000/api/auth/google')
    assert.equal(start.status, 302)
    const authorization = new URL(start.headers.get('Location'))
    assert.equal(authorization.searchParams.get('redirect_uri'), `${origin}/api/auth/google/callback`)
    const state = authorization.searchParams.get('state')
    const stateCookie = start.headers.get('Set-Cookie')
    assert.match(stateCookie, /HttpOnly/)
    assert.equal(/; Secure/.test(stateCookie), origin.startsWith('https:'))
    const invalid = await app.request('/api/auth/google/callback?code=code&state=wrong', { headers: { Cookie: stateCookie.split(';')[0] } })
    assert.equal(invalid.headers.get('Location'), '/login?error=invalid_state')
    assert.equal(calls.length, 0)
    const callback = await app.request(`/api/auth/google/callback?code=code&state=${state}`, { headers: { Cookie: stateCookie.split(';')[0] } })
    assert.equal(callback.headers.get('Location'), '/')
    const sessionCookie = callback.headers.getSetCookie().find((cookie) => cookie.startsWith('cd_session='))
    assert.ok(sessionCookie)
    assert.equal(/; Secure/.test(sessionCookie), origin.startsWith('https:'))
    const headers = { Cookie: sessionCookie.split(';')[0], Origin: origin }
    const me = await (await app.request('/api/auth/me', { headers })).json()
    assert.equal(me.data.email, 'admin@example.test')
    assert.equal(me.data.role, 'ADMIN')
    assert.equal(me.data.status, 'APPROVED')
    assert.equal((await app.request('/api/admin/users', { headers })).status, 200)
    assert.equal((await app.request('/api/auth/logout', { method: 'POST', headers })).status, 200)
    assert.equal((await (await app.request('/api/auth/me', { headers })).json()).data, null)
    assert.equal(calls.length, 2)
  })
}
