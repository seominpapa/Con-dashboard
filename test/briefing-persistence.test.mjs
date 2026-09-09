import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { getOrCreateTodayBriefing } = await vite.ssrLoadModule('/src/worker/briefing/BriefingService.ts')
const { default: dashboard } = await vite.ssrLoadModule('/src/worker/routes/dashboard.ts')
after(() => vite.close())

const structured = {
  summary: '오늘 등록된 할일이 없습니다.', priorityItems: [], scheduleItems: [],
  riskItems: [], marketItems: [], informationItems: [],
}
const user = { userId: 'u1', userName: '테스트' }
const config = { widgets: [{ widgetId: 'todo', instanceId: 'todo-1' }] }

function setup(t) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
  sqlite.exec("INSERT INTO users (id, email, name, google_id) VALUES ('u1','test@example.com','테스트','test-google')")
  sqlite.prepare('INSERT INTO dashboard_configs (id,user_id,config_json) VALUES (?,?,?)').run('dc1','u1',JSON.stringify(config))
  const db = {
    prepare(sql) {
      return { bind: (...args) => ({
        first: async () => sqlite.prepare(sql).get(...args) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }),
      }) }
    },
  }
  t.after(() => sqlite.close())
  const env = { DB: db, AUTH_SECRET: 'test-only-secret-not-a-production-credential', OPENAI_API_KEY: 'test-only' }
  const requests = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal)
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify({
      model: 'test-model', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(structured) } }],
      usage: { prompt_tokens: 10, completion_tokens: 30 },
    }))
  })
  return { sqlite, env, requests }
}

test('first visit persists the result; reload and config sync reuse it; next Seoul day generates once', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-09T14:59:00Z') })
  const { sqlite, env, requests } = setup(t)
  const first = await getOrCreateTodayBriefing(env, user)
  assert.equal(first.status, 'ready')
  assert.equal(first.briefingDate, '2026-09-09')
  assert.deepEqual(first.structured, structured)
  assert.equal(requests[0].response_format.type, 'json_schema')
  assert.equal(requests[0].response_format.json_schema.strict, true)
  const stored = sqlite.prepare('SELECT * FROM ai_briefings').get()
  assert.deepEqual(JSON.parse(stored.structured_content), structured)

  // Even the first config sync must not invalidate an already stored success.
  sqlite.exec('DELETE FROM dashboard_configs')
  const { Hono } = await vite.ssrLoadModule('hono')
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('currentUser', { id: user.userId }); await next() })
  app.route('/dashboard', dashboard)
  const response = await app.request('/dashboard/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }, env)
  assert.equal(response.status, 200)
  t.mock.timers.tick(30_000)
  const cached = await getOrCreateTodayBriefing(env, user)
  assert.deepEqual(cached, first)
  assert.equal(requests.length, 1)

  t.mock.timers.tick(60_000)
  const tomorrow = await getOrCreateTodayBriefing(env, user)
  assert.equal(tomorrow.status, 'ready')
  assert.equal(tomorrow.briefingDate, '2026-09-10')
  assert.equal(requests.length, 2)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_briefings').get().n, 2)
})

test('usage log failure does not turn a persisted success into a failed briefing', async (t) => {
  const { sqlite, env, requests } = setup(t)
  sqlite.exec("CREATE TRIGGER fail_usage BEFORE INSERT ON ai_usage_logs BEGIN SELECT RAISE(FAIL, 'logging unavailable'); END")
  assert.equal((await getOrCreateTodayBriefing(env, user)).status, 'ready')
  assert.equal((await getOrCreateTodayBriefing(env, user)).status, 'ready')
  assert.equal(requests.length, 1)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_briefings').get().n, 1)
})

test('Claude also bounds requests below the generation lease and caches successful results', async (t) => {
  const { env } = setup(t)
  let calls = 0
  const timeouts = []
  const timeout = AbortSignal.timeout.bind(AbortSignal)
  t.mock.method(AbortSignal, 'timeout', (ms) => { timeouts.push(ms); return timeout(ms) })
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++
    assert.ok(init.signal instanceof AbortSignal)
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(structured) }], model: 'test-claude' }))
  })
  const claudeEnv = { ...env, OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: 'test-only' }
  assert.equal((await getOrCreateTodayBriefing(claudeEnv, user)).status, 'ready')
  assert.equal((await getOrCreateTodayBriefing(claudeEnv, user)).status, 'ready')
  assert.equal(calls, 1)
  assert.deepEqual(timeouts, [120_000])
})

test('incomplete, refused, empty and malformed responses are not saved; a later retry succeeds', async (t) => {
  const { sqlite, env } = setup(t)
  const replies = [
    { finish_reason: 'length', message: { content: JSON.stringify(structured) } },
    { finish_reason: 'stop', message: { refusal: 'private upstream content' } },
    { finish_reason: 'stop', message: { content: '' } },
    { finish_reason: 'stop', message: { content: '{"summary":"missing required lists"}' } },
    { finish_reason: 'stop', message: { content: JSON.stringify(structured) } },
  ]
  let index = 0
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [replies[index++]] })))
  for (let i = 0; i < 4; i++) {
    assert.equal((await getOrCreateTodayBriefing(env, user)).status, 'error')
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_briefings').get().n, 0)
  }
  assert.equal((await getOrCreateTodayBriefing(env, user)).status, 'ready')
  assert.equal(index, 5)
  assert.ok(!JSON.stringify(sqlite.prepare('SELECT error_message FROM ai_usage_logs').all()).includes('private upstream content'))
})

test('concurrent requests call the LLM only once and later retrieve the stored result', async (t) => {
  const { env, requests } = setup(t)
  const responses = await Promise.all(Array.from({ length: 4 }, () => getOrCreateTodayBriefing(env, user)))
  assert.equal(requests.length, 1)
  assert.ok(responses.every((r) => r.status === 'ready' || r.status === 'generating'))
  assert.equal((await getOrCreateTodayBriefing(env, user)).status, 'ready')
  assert.equal(requests.length, 1)
})

test('a slow context request rechecks cache after the first generator releases its lease', async (t) => {
  const { env, requests } = setup(t)
  let release
  let blocked
  const waiting = new Promise((resolve) => { blocked = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  const prepare = env.DB.prepare
  let paused = false
  env.DB.prepare = (sql) => {
    const statement = prepare(sql)
    if (!sql.includes('SELECT * FROM todos')) return statement
    return { bind: (...args) => {
      const bound = statement.bind(...args)
      return { ...bound, all: async () => {
        if (!paused) { paused = true; blocked(); await gate }
        return bound.all()
      } }
    } }
  }
  const slow = getOrCreateTodayBriefing(env, user)
  await waiting
  const fast = await getOrCreateTodayBriefing(env, user)
  release()
  assert.equal((await slow).status, 'ready')
  assert.equal(fast.status, 'ready')
  assert.equal(requests.length, 1)
})
