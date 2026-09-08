import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { PUBLIC_API_PROVIDERS } from '../src/shared/types/integration.ts'
import { NlicLawProvider } from '../src/worker/providers/laws/NlicLawProvider.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('law integration asks for OC instead of a generic API key', () => {
  const provider = PUBLIC_API_PROVIDERS.find((item) => item.key === 'law')
  assert.equal(provider?.envVar, 'LAW_OC')

  const adminPage = read('src/client/pages/admin/AdminIntegrationsPage.tsx')
  const adminRoute = read('src/worker/routes/admin/integrations.ts')
  const providerIndex = read('src/worker/providers/laws/index.ts')
  assert.match(adminPage, /provider === 'law'/)
  assert.match(adminPage, /key: 'oc', label: 'OC'/)
  assert.match(adminPage, /공동활용 신청 시 발급된 API 인증값/)
  assert.match(adminRoute, /provider === 'law' && stored\?\.apiKey/)
  assert.match(providerIndex, /dbCred\?\.oc \|\| dbCred\?\.apiKey \|\| env\.LAW_OC \|\| env\.LAW_API_KEY/)
})

test('law provider searches current laws and uses the official detail link', async () => {
  const originalFetch = globalThis.fetch
  let signal
  globalThis.fetch = async (input, init) => {
    signal = init?.signal
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('OC'), 'law-user-id')
    assert.equal(url.searchParams.has('apiKey'), false)
    assert.equal(url.searchParams.get('target'), 'eflaw')
    assert.equal(url.searchParams.get('display'), '10')
    return new Response(JSON.stringify({
      LawSearch: {
        resultCode: '00',
        law: {
          법령일련번호: '273435',
          법령명한글: '건설산업기본법',
          공포일자: '20250826',
          시행일자: '20251127',
          법령상세링크: '/DRF/lawService.do?OC=law-user-id&target=law&MST=273435',
        },
      },
    }))
  }

  try {
    const laws = await new NlicLawProvider('law-user-id').searchLaws('건설산업', 10)
    assert.equal(laws.length, 1)
    assert.equal(laws[0].id, '273435')
    assert.equal(laws[0].name, '건설산업기본법')
    assert.equal(laws[0].effectiveDate, '2025-11-27')
    assert.equal(laws[0].url, 'https://www.law.go.kr/법령/%EA%B1%B4%EC%84%A4%EC%82%B0%EC%97%85%EA%B8%B0%EB%B3%B8%EB%B2%95')
    assert.ok(signal instanceof AbortSignal)
    assert.doesNotMatch(laws[0].url, /law-user-id|[?&]OC=/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('law provider caps search results and rejects invalid search terms', async () => {
  const provider = new NlicLawProvider('law-user-id')
  await assert.rejects(() => provider.searchLaws(' ', 10), /검색어/)
  await assert.rejects(() => provider.searchLaws('가'.repeat(51), 10), /검색어/)

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('display'), '20')
    return new Response(JSON.stringify({ LawSearch: { law: [] } }))
  }
  try {
    assert.deepEqual(await provider.searchLaws('건설', 100), [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('law provider accepts array responses and keeps partial results', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const query = new URL(String(input)).searchParams.get('query')
    return new Response(JSON.stringify(query === '건설산업기본법'
      ? { LawSearch: { law: [{ 법령일련번호: '1', 법령명한글: '건설산업기본법' }] } }
      : { LawSearch: {} }))
  }

  try {
    const laws = await new NlicLawProvider('law-user-id').getLaws(['건설산업기본법', '없는법'])
    assert.equal(laws[0].id, '1')
    assert.equal(laws[0].changed, false)
    assert.equal(laws[1].id, 'error-없는법')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('law route and widget support validated search and persisted selections', () => {
  const route = read('src/worker/routes/laws.ts')
  const widget = read('src/client/widgets/LawWidget.tsx')
  const lawTypes = read('src/shared/types/law.ts')

  assert.match(route, /app\.get\('\/search'/)
  assert.match(route, /LAW_SEARCH_MIN_LENGTH/)
  assert.match(route, /LAW_SEARCH_MAX_LENGTH/)
  assert.match(route, /provider\.searchLaws\(query/)
  assert.match(route, /law_list_rate:/)
  assert.match(widget, /settings\.lawNames/)
  assert.match(widget, /onSettingsChange\(\{ \.\.\.settings, lawNames:/)
  assert.match(widget, /\/api\/laws\/search\?q=/)
  assert.match(widget, /maxLength=\{LAW_SEARCH_MAX_LENGTH\}/)
  assert.match(widget, /href=\{l\.url\}/)
  assert.match(widget, /법령 추가\/관리/)
  assert.match(lawTypes, /LAW_SEARCH_MIN_LENGTH = 2/)
  assert.match(lawTypes, /LAW_SEARCH_MAX_LENGTH = 50/)
})
