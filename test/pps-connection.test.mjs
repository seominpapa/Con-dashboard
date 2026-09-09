import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { default: routes } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
after(() => vite.close())
const secret = randomUUID()
function setup(t, upstream) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'))
  t.after(() => sqlite.close())
  const DB = { prepare(sql) {
    const bound = (...args) => ({ first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => sqlite.prepare(sql).run(...args) })
    return { ...bound(), bind: bound }
  } }
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(new URL(url)); return upstream() })
  const app = new Hono()
  app.use('*', async (c, next) => { c.set('currentUser', { id: 'admin' }); await next() })
  app.route('/', routes)
  const env = { DB, AUTH_SECRET: 's'.repeat(32) }
  const connect = () => app.request('/material_prices/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: { apiKey: secret } }) }, env)
  return { sqlite, calls, connect, retest: () => app.request('/material_prices/test', { method: 'POST' }, env) }
}

test('PPS no-data response saves credential and explicitly reports no data on connect/retest', async (t) => {
  const { sqlite, calls, connect, retest } = setup(t, () => Response.json({ response: { header: { resultCode: '03' } } }))
  const response = await connect()
  assert.equal(response.status, 200)
  assert.match((await response.json()).data.testResult.message, /조회 결과 없음/)
  assert.equal(calls[0].searchParams.get('numOfRows'), '1')
  assert.equal(sqlite.prepare('SELECT status FROM integrations').get().status, 'CONNECTED')
  assert.match((await (await retest()).json()).data.testResult.message, /조회 결과 없음/)
})

for (const [format, code, text] of [['json', '30', '인증키'], ['xml', '20', '승인'], ['json', '22', '호출'], ['xml', '31', '만료']]) {
  test(`PPS ${format} gateway ${code} exposes safe status/code, not upstream secrets`, async (t) => {
    const body = format === 'json' ? JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: code, errMsg: secret } } })
      : `<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>${code}</returnReasonCode><errMsg>${secret}</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>`
    const { sqlite, connect } = setup(t, () => new Response(body, { status: 403 }))
    const response = await connect()
    assert.equal(response.status, 400)
    const message = (await response.json()).message
    assert.match(message, /HTTP 403/)
    assert.ok(message.includes(code))
    assert.ok(message.includes(text))
    assert.ok(!message.includes(secret))
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM integrations').get().n, 0)
  })
}

for (const [name, upstream, expected] of [
  ['timeout', () => { throw new DOMException(secret, 'TimeoutError') }, /시간.*초과/],
  ['network', () => { throw new TypeError(secret) }, /통신/],
  ['bad html', () => new Response(`<html>${secret}</html>`), /응답 형식/],
  ['server failure despite no-data code', () => Response.json({ header: { resultCode: '03' } }, { status: 502 }), /HTTP 502/],
  ['unknown code', () => Response.json({ header: { resultCode: secret } }), /알 수 없는/],
]) {
  test(`PPS ${name} remains a safe failure`, async (t) => {
    const { connect } = setup(t, upstream)
    const response = await connect()
    assert.equal(response.status, 400)
    const message = (await response.json()).message
    assert.match(message, expected)
    assert.ok(!message.includes(secret))
  })
}
