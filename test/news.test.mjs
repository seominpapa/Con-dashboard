import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { RssNewsProvider } from '../src/worker/providers/news/RssNewsProvider.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const NEWS_CATEGORIES = ['건설정책', 'SOC', '건설안전', '중대재해', '건설사', '수주', '부동산', '스마트건설', 'AI/AX', '해외건설']

test('GDELT covers every category, including a distinct serious-accident category', () => {
  const newsTypes = read('src/shared/types/news.ts')
  const rssProvider = read('src/worker/providers/news/RssNewsProvider.ts')

  for (const category of NEWS_CATEGORIES) assert.match(newsTypes, new RegExp(`['"]${category}['"]`))
  assert.match(rssProvider, /api\.gdeltproject\.org\/api\/v2\/doc\/doc/)
  assert.match(rssProvider, /sourcelang:korean/)
  assert.doesNotMatch(rssProvider, /news\.google\.com/)
  for (const category of NEWS_CATEGORIES) assert.match(rssProvider, new RegExp(`['"]${category}['"]`))
  assert.match(rssProvider, /중대재해/)
})

test('MOEL uses its current policy, notice, and law-information RSS feeds', () => {
  const rssProvider = read('src/worker/providers/news/RssNewsProvider.ts')

  for (const endpoint of ['policy.do', 'notice.do', 'lawinfo.do']) assert.match(rssProvider, new RegExp(`moel\\.go\\.kr/rss/${endpoint.replace('.', '\\.')}`))
  assert.doesNotMatch(rssProvider, /moelRssList\.do/)
})

test('construction news keeps official MOLIT RSS results when GDELT is rate-limited', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    if (url.hostname === 'api.gdeltproject.org') return new Response('', { status: 429 })
    if (url.hostname === 'www.molit.go.kr' && url.searchParams.get('rss_id') === 'NEWS') {
      return new Response(`<?xml version="1.0"?><rss><channel><item>
        <title><![CDATA[국토부 건설현장 안전점검]]></title>
        <link>https://www.molit.go.kr/article/1</link>
        <pubDate>Mon, 08 Sep 2026 10:00:00 +0900</pubDate>
      </item></channel></rss>`)
    }
    return new Response('', { status: 503 })
  }

  try {
    const news = await new RssNewsProvider().getNews(['건설안전'], 10)
    assert.ok(calls.some((url) => url.hostname === 'www.molit.go.kr' && url.searchParams.get('rss_id') === 'NEWS'))
    assert.equal(news.length, 1)
    assert.equal(news[0].source, '국토교통부')
    assert.equal(news[0].title, '국토부 건설현장 안전점검')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('free news provider makes one Korean GDELT request, normalizes it, and survives partial MOEL failure', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)

    if (url.hostname === 'api.gdeltproject.org') {
      return new Response(JSON.stringify({ articles: [{
        title: '현장 &amp; 안전 &lt;점검&gt;',
        domain: 'news.example.test',
        seendate: '20260907T130000Z',
        url: 'https://news.example.test/article-1',
      }, {
        title: '현장 &amp; 안전 &lt;점검&gt;',
        domain: 'news.example.test',
        seendate: '20260907T130000Z',
        url: 'https://news.example.test/article-1',
      }] }), { status: 200 })
    }

    return new Response('', { status: 503 })
  }

  try {
    const news = await new RssNewsProvider().getNews(['건설안전', '중대재해'], 10)
    const gdeltCalls = calls.filter((url) => url.hostname === 'api.gdeltproject.org')
    assert.equal(gdeltCalls.length, 1)
    assert.match(gdeltCalls[0].searchParams.get('query') ?? '', /sourcelang:korean/)
    assert.ok(calls.some((url) => url.hostname === 'www.moel.go.kr'))
    assert.equal(news.filter((item) => item.title === '현장 & 안전 <점검>').length, 1)
    assert.deepEqual(news[0] && {
      title: news[0].title,
      source: news[0].source,
      publishedAt: news[0].publishedAt,
      url: news[0].url,
    }, {
      title: '현장 & 안전 <점검>',
      source: 'news.example.test',
      publishedAt: '2026-09-07T13:00:00.000Z',
      url: 'https://news.example.test/article-1',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('free news provider returns only explicitly requested categories', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'api.gdeltproject.org') {
      return new Response(JSON.stringify({ articles: [
        { title: '건설현장 중대재해 사례 공개', domain: 'safety.example.test', seendate: '20260907T130000Z', url: 'https://safety.example.test/1' },
        { title: '아파트 분양시장 동향', domain: 'estate.example.test', seendate: '20260907T120000Z', url: 'https://estate.example.test/1' },
      ] }))
    }
    return new Response('', { status: 503 })
  }

  try {
    const news = await new RssNewsProvider().getNews(['중대재해'], 10)
    assert.ok(news.length > 0)
    assert.ok(news.every((item) => item.category === '중대재해'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('free news provider returns an empty list when sources succeed without a requested-category match', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'api.gdeltproject.org') {
      return new Response(JSON.stringify({ articles: [
        { title: '아파트 분양시장 동향', domain: 'estate.example.test', seendate: '20260907T120000Z', url: 'https://estate.example.test/1' },
      ] }))
    }
    return new Response('', { status: 503 })
  }

  try {
    assert.deepEqual(await new RssNewsProvider().getNews(['AI/AX'], 10), [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('public API connections accept an optional ISO expiry date and return its derived state', () => {
  const integrationTypes = read('src/shared/types/integration.ts')
  const adminRoute = read('src/worker/routes/admin/integrations.ts')
  const repository = read('src/worker/repositories/IntegrationRepository.ts')
  const adminPage = read('src/client/pages/admin/AdminIntegrationsPage.tsx')

  assert.match(integrationTypes, /expiresAt\??:\s*string\s*\|\s*null/)
  assert.match(adminRoute, /body\.expiresAt/)
  assert.match(adminRoute, /expiresAt/)
  assert.match(adminRoute, /EXPIRED/)
  assert.match(repository, /expiresAt/)
  assert.match(adminPage, /expiresAt/)
  assert.match(adminPage, /type="date"/)
  assert.match(adminPage, /만료/)
  assert.match(adminPage, /갱신/)
})

test('news is credential-free and the removed Naver News credential is not configurable', () => {
  for (const path of [
    'src/shared/types/integration.ts',
    'src/worker/integrations/publicCredentials.ts',
    'src/client/pages/admin/AdminIntegrationsPage.tsx',
    'src/worker/routes/admin/integrations.ts',
    'src/worker/providers/news/index.ts',
  ]) {
    const source = read(path)
    assert.doesNotMatch(source, /(?:^|[^_])'naver'(?:[^_]|$)/)
    assert.doesNotMatch(source, /NAVER_CLIENT_(?:ID|SECRET)/)
    assert.doesNotMatch(source, /NaverNewsProvider/)
  }
})

test('briefing makes one news request and partitions up to three serious-accident items as fact-bound safety information', () => {
  const contextBuilder = read('src/worker/briefing/BriefingContextBuilder.ts')
  const prompt = read('src/worker/briefing/prompt.ts')

  assert.equal((contextBuilder.match(/provider\.getNews\(/g) ?? []).length, 1)
  assert.match(contextBuilder, /seriousAccidents/)
  assert.match(contextBuilder, /중대재해/)
  assert.match(contextBuilder, /slice\(0,\s*3\)/)
  assert.match(prompt, /중대재해/)
  assert.match(prompt, /안전 정보/)
  for (const fact of ['원인', '책임', '예방']) assert.match(prompt, new RegExp(fact))
  assert.match(prompt, /지어내지 마세요/)
})
