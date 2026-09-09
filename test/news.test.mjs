import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { RssNewsProvider } from '../src/worker/providers/news/RssNewsProvider.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const NEWS_CATEGORIES = ['건설정책', 'SOC', '건설안전', '중대재해', '건설사', '수주', '부동산', '스마트건설', 'AI/AX', '해외건설']
const FEED_IDS = ['CONSTIMES', 'KOSCAJ', 'ANJUNJ', 'SAFETYNEWS', 'BING_ORDER', 'BING_ESTATE', 'BING_TECH']

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map((i) => `<item>
  <title>${i.title}</title><link>${i.url}</link><pubDate>${i.pubDate ?? 'Mon, 07 Sep 2026 13:00:00 GMT'}</pubDate>${i.source ? `<News:Source>${i.source}</News:Source>` : ''}</item>`).join('')}</channel></rss>`

/** hostname(또는 Bing 검색어)별 응답을 지정하고, 나머지 피드는 빈 채널을 돌려준다. */
function mockFeeds(t, byNeedle) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    const hit = Object.entries(byNeedle).find(([needle]) => url.hostname.includes(needle) || (url.searchParams.get('q') ?? '').includes(needle))
    return hit ? hit[1]() : new Response(rss([]))
  })
  return calls
}

test('news categories are covered and only Cloudflare-reachable trade press and Bing feeds are used', () => {
  const newsTypes = read('src/shared/types/news.ts')
  const rssProvider = read('src/worker/providers/news/RssNewsProvider.ts')

  for (const category of NEWS_CATEGORIES) assert.match(newsTypes, new RegExp(`['"]${category}['"]`))
  assert.match(rssProvider, /bing\.com\/news\/search/)
  assert.match(rssProvider, /constimes\.co\.kr|koscaj\.com/)
  assert.doesNotMatch(rssProvider, /gdeltproject|moel\.go\.kr|molit\.go\.kr|news\.google\.com/)
  assert.match(rssProvider, /중대재해/)
})

test('trade press feeds use KST timestamps and Bing feeds carry the publisher and Korean market settings', async (t) => {
  const calls = mockFeeds(t, {
    'constimes.co.kr': () => new Response(rss([{ title: '현장 &amp; 안전 &lt;점검&gt;', url: 'https://news.example.test/article-1', pubDate: '2026-09-07 22:00:00' }])),
    '건설사 수주': () => new Response(rss([
      { title: '대형 건설사 해외 수주 - 예시신문', source: '예시신문', url: 'https://news.example.test/article-2', pubDate: 'Mon, 07 Sep 2026 12:00:00 GMT' },
      { title: '대형 건설사 해외 수주 - 예시신문', source: '예시신문', url: 'https://news.example.test/article-2', pubDate: 'Mon, 07 Sep 2026 12:00:00 GMT' },
    ])),
  })

  const news = await new RssNewsProvider().getNews([], 10)
  assert.equal(calls.length, FEED_IDS.length)
  assert.ok(calls.filter((url) => url.hostname === 'www.bing.com').every((url) => url.searchParams.get('format') === 'rss' && url.searchParams.get('setlang') === 'ko-KR'))
  assert.deepEqual(news.map(({ title, source, publishedAt, url }) => ({ title, source, publishedAt, url })), [
    { title: '현장 & 안전 <점검>', source: '건설타임즈', publishedAt: '2026-09-07T13:00:00.000Z', url: 'https://news.example.test/article-1' },
    { title: '대형 건설사 해외 수주', source: '예시신문', publishedAt: '2026-09-07T12:00:00.000Z', url: 'https://news.example.test/article-2' },
  ])
})

test('partial feed failure keeps the results of the feeds that succeeded', async (t) => {
  mockFeeds(t, {
    'constimes.co.kr': () => new Response('', { status: 429 }),
    'anjunj.com': () => new Response(rss([{ title: '국토부 건설현장 안전점검', url: 'https://www.molit.go.kr/article/1' }])),
  })
  const news = await new RssNewsProvider().getNews(['건설안전'], 10)
  assert.equal(news.length, 1)
  assert.equal(news[0].title, '국토부 건설현장 안전점검')
})

test('free news provider returns only explicitly requested categories', async (t) => {
  mockFeeds(t, {
    'anjunj.com': () => new Response(rss([
      { title: '건설현장 중대재해 사례 공개', url: 'https://safety.example.test/1' },
      { title: '아파트 분양시장 동향', url: 'https://estate.example.test/1', pubDate: 'Mon, 07 Sep 2026 12:00:00 GMT' },
    ])),
  })
  const news = await new RssNewsProvider().getNews(['중대재해'], 10)
  assert.ok(news.length > 0)
  assert.ok(news.every((item) => item.category === '중대재해'))
})

test('free news provider returns an empty list when sources succeed without a requested-category match', async (t) => {
  mockFeeds(t, { 'anjunj.com': () => new Response(rss([{ title: '아파트 분양시장 동향', url: 'https://estate.example.test/1' }])) })
  assert.deepEqual(await new RssNewsProvider().getNews(['해외건설'], 10), [])
})

test('news source failures disguised as HTTP 200 do not replace saved news with an empty success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html><body>blocked</body></html>'))
  await assert.rejects(new RssNewsProvider().getNews([], 10), /뉴스 소스 조회에 실패했습니다/)
})

test('a valid empty RSS channel remains a successful empty result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(rss([])))
  assert.deepEqual(await new RssNewsProvider().getNews([], 10), [])
})

test('each news source has a timeout signal so one stalled source cannot hang the widget', async (t) => {
  const signals = []
  t.mock.method(globalThis, 'fetch', async (_input, init) => { signals.push(init?.signal); return new Response(rss([])) })
  await new RssNewsProvider().getNews([], 10)
  assert.equal(signals.length, FEED_IDS.length)
  assert.ok(signals.every((signal) => signal instanceof AbortSignal))
})

test('all failed news sources expose only fixed IDs and failure codes, never upstream error details', async (t) => {
  const privateDetail = 'private-upstream-body-and-credential'
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.hostname.includes('constimes')) return new Response(privateDetail, { status: 429 })
    if (url.hostname.includes('koscaj')) throw new DOMException(privateDetail, 'TimeoutError')
    if (url.hostname.includes('anjunj')) return new Response(`<html>${privateDetail}</html>`)
    throw new Error(privateDetail)
  })
  await assert.rejects(new RssNewsProvider().getNews([], 10), (error) => {
    assert.equal(error.name, 'NewsSourcesUnavailableError')
    assert.match(error.message, /CONSTIMES=HTTP_429/)
    assert.match(error.message, /KOSCAJ=TIMEOUT/)
    assert.match(error.message, /ANJUNJ=FORMAT_HTML(?:,|\])/)
    for (const id of ['SAFETYNEWS', 'BING_ORDER', 'BING_ESTATE', 'BING_TECH']) assert.match(error.message, new RegExp(`${id}=NETWORK`))
    assert.ok(!error.message.includes(privateDetail))
    assert.ok(!error.message.includes('https://'))
    return true
  })
})

for (const [code, body] of [
  ['FORMAT_EMPTY', '  \n '],
  ['FORMAT_HTML', '<!DOCTYPE html><html>private-response-body</html>'],
  ['FORMAT_RSS', '<rss><channel>private-response-body'],
  ['FORMAT_OTHER', '{"private-response-body":true}'],
]) {
  test(`news RSS diagnostic distinguishes ${code} without exposing its body`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (input) => new URL(String(input)).hostname.includes('constimes')
      ? new Response(body)
      : new Response('', { status: 503 }))
    await assert.rejects(new RssNewsProvider().getNews([], 10), (error) => {
      assert.ok(error.message.includes(`CONSTIMES=${code}`))
      assert.ok(!error.message.includes('private-response-body'))
      assert.ok(!error.message.includes('<rss>'))
      return true
    })
  })
}
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
