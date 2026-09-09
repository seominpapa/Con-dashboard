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

for (const [code, expected] of [['02', /기관.*서비스/], ['06', /날짜.*형식/], ['07', /입력.*범위/], ['08', /필수.*누락/], ['11', /필수.*누락/]]) {
  test(`PPS HTTP 200 application error ${code} preserves actionable diagnostics on connect and retest`, async (t) => {
    let reject = false
    const { sqlite, connect, retest } = setup(t, () => Response.json(reject
      ? { response: { header: { resultCode: code, resultMsg: secret } } }
      : { header: { resultCode: '00' }, body: { items: [] } }))
    assert.equal((await connect()).status, 200)
    reject = true
    const tested = (await (await retest()).json()).data.testResult
    assert.equal(tested.ok, false)
    assert.match(tested.message, expected)
    assert.ok(tested.message.includes(`HTTP 200, 코드 ${code}`))
    assert.ok(!tested.message.includes(secret))
    const encrypted = sqlite.prepare('SELECT encrypted_credential FROM integrations').get().encrypted_credential
    const response = await connect()
    assert.equal(response.status, 400)
    assert.equal((await response.json()).message, tested.message)
    assert.equal(sqlite.prepare('SELECT encrypted_credential FROM integrations').get().encrypted_credential, encrypted)
  })
}

for (const code of ['99', '000', 7, 0]) {
  test(`PPS unsupported code ${JSON.stringify(code)} stays an error with bounded diagnostic code`, async (t) => {
    const { connect } = setup(t, () => Response.json({ header: { resultCode: code, resultMsg: secret }, body: { items: [] } }))
    const response = await connect()
    assert.equal(response.status, 400)
    const message = (await response.json()).message
    assert.ok(message.includes(`코드 ${String(code).padStart(2, '0')}`))
    assert.ok(!message.includes(secret))
  })
}

test('PPS missing or malformed diagnostic codes never echo arbitrary response content', async (t) => {
  let code
  const { connect } = setup(t, () => Response.json({ header: { resultCode: code, resultMsg: secret } }))
  for (const value of [undefined, null, secret, '1234567890', '<script>', { value: secret }, 1.5, -1, 1000]) {
    code = value
    const response = await connect()
    assert.equal(response.status, 400)
    const message = (await response.json()).message
    assert.match(message, value == null ? /응답코드 누락/ : /응답코드 형식 오류/)
    assert.ok(!message.includes(secret))
  }
})

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
