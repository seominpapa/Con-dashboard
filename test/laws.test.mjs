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

test('law provider sends OC and accepts the singleton response returned for display=1', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('OC'), 'law-user-id')
    assert.equal(url.searchParams.has('apiKey'), false)
    assert.equal(url.searchParams.get('target'), 'law')
    assert.equal(url.searchParams.get('display'), '1')
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
    const laws = await new NlicLawProvider('law-user-id').getLaws(['건설산업기본법'])
    assert.equal(laws.length, 1)
    assert.equal(laws[0].id, '273435')
    assert.equal(laws[0].name, '건설산업기본법')
    assert.equal(laws[0].effectiveDate, '2025-11-27')
    assert.equal(laws[0].url, `https://www.law.go.kr/법령/${encodeURIComponent('건설산업기본법')}`)
    assert.doesNotMatch(laws[0].url, /OC=/)
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
