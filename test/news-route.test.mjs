import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { Hono } from 'hono'
import { createServer } from 'vite'

const articles = [
  { title: '건설현장 안전점검', domain: 'news.example.test', seendate: '20260909T020000Z', url: 'https://news.example.test/safety' },
  { title: '철도 노선 건설 계획', domain: 'news.example.test', seendate: '20260909T010000Z', url: 'https://news.example.test/rail' },
]

async function setup(t) {
  const sqlite = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, dir), 'utf8'))
  t.after(() => sqlite.close())
  const DB = { prepare(sql) {
    const bound = (...args) => ({
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => sqlite.prepare(sql).run(...args),
    })
    return { ...bound(), bind: bound }
  } }
  const newWorker = async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'error', server: { watch: null } })
    t.after(() => vite.close())
    const { default: routes } = await vite.ssrLoadModule('/src/worker/routes/news.ts')
    const app = new Hono()
    app.route('/', routes)
    return (query = '') => app.request(`/${query}`, {}, { DB })
  }
  return { newWorker }
}

test('news survives a fresh Worker, shares one snapshot across limits, and retains original stale timestamps', async (t) => {
  const { newWorker } = await setup(t)
  const now = new Date('2026-09-09T03:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now })
  let mode = 'articles'
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls++
    return mode !== 'fail' && new URL(String(input)).hostname === 'api.gdeltproject.org'
      ? Response.json({ articles: mode === 'empty' ? [] : articles })
      : new Response('', { status: 503 })
  })
  const firstWorker = await newWorker()
  const original = await (await firstWorker('?limit=1')).json()
  assert.equal(original.data.length, 1)
  const secondWorker = await newWorker()
  mode = 'fail'
  const initialCalls = calls
  const restoredResponse = await secondWorker('?limit=30')
  assert.equal(restoredResponse.status, 200)
  const restored = await restoredResponse.json()
  assert.equal(restored.data.length, 2)
  assert.equal(restored.cached, true)
  assert.equal(restored.updatedAt, original.updatedAt)
  assert.equal(calls, initialCalls)
  t.mock.timers.setTime(now.getTime() + 21 * 60_000)
  const stale = await (await secondWorker('?limit=6')).json()
  assert.equal(stale.data.length, 2)
  assert.equal(stale.stale, true)
  assert.equal(stale.updatedAt, original.updatedAt)
  mode = 'empty'
  const kept = await (await secondWorker('?limit=6')).json()
  assert.equal(kept.data.length, 2)
  assert.equal(kept.stale, true)
  assert.equal(kept.updatedAt, original.updatedAt)
})

test('category queries keep a matching article beyond the first 50 general articles and canonicalize duplicate categories', async (t) => {
  const { newWorker } = await setup(t)
  const generalArticles = Array.from({ length: 51 }, (_, index) => ({
    title: `아파트 분양시장 동향 ${index}`, domain: 'news.example.test',
    seendate: '20260909T020000Z', url: `https://news.example.test/general-${index}`,
  }))
  const rareArticle = { title: '인공지능 건설 기술 도입', domain: 'news.example.test', seendate: '20260908T010000Z', url: 'https://news.example.test/ai' }
  let calls = 0
  let fail = false
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls++
    return !fail && new URL(String(input)).hostname === 'api.gdeltproject.org'
      ? Response.json({ articles: [...generalArticles, rareArticle] })
      : new Response('', { status: 503 })
  })
  const request = await newWorker()
  const general = await (await request('?limit=50')).json()
  assert.equal(general.data.length, 50)
  assert.ok(general.data.every((entry) => entry.category === '부동산'))
  const filtered = await (await request(`?categories=${encodeURIComponent('AI/AX')}&limit=6`)).json()
  assert.equal(filtered.data.length, 1)
  assert.equal(filtered.data[0].title, rareArticle.title)
  const recordedCalls = calls
  fail = true
  const restored = await (await request(`?categories=${encodeURIComponent('AI/AX,AI/AX')}&limit=30`)).json()
  assert.equal(restored.data[0].title, rareArticle.title)
  assert.equal(calls, recordedCalls)
})

test('news rejects unsupported category and invalid limits before calling providers', async (t) => {
  const { newWorker } = await setup(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ articles }) })
  const request = await newWorker()
  for (const query of ['?limit=0', '?limit=51', '?limit=1.5', '?limit=abc', '?categories=unknown']) {
    assert.equal((await request(query)).status, 400)
  }
  assert.equal(calls, 0)
})

test('news with no prior snapshot reports genuine empty results without persisting emptiness', async (t) => {
  const { newWorker } = await setup(t)
  let empty = true
  t.mock.method(globalThis, 'fetch', async (input) => new URL(String(input)).hostname === 'api.gdeltproject.org'
    ? Response.json({ articles: empty ? [] : articles })
    : new Response('', { status: 503 }))
  const request = await newWorker()
  const noNews = await request('?limit=6')
  assert.equal(noNews.status, 200)
  assert.deepEqual((await noNews.json()).data, [])
  empty = false
  const found = await (await request('?limit=6')).json()
  assert.equal(found.data.length, 2)
})

test('news route exposes safe source failure diagnostics without raw upstream details', async (t) => {
  const { newWorker } = await setup(t)
  const privateDetail = 'private-upstream-body-and-credential'
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(privateDetail) })
  const request = await newWorker()
  const response = await request('?limit=6')
  assert.equal(response.status, 502)
  const result = await response.json()
  assert.match(result.message, /GDELT=NETWORK/)
  assert.match(result.message, /MOEL_POLICY=NETWORK/)
  assert.ok(!JSON.stringify(result).includes(privateDetail))
})
