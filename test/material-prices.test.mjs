import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { PpsMaterialPriceProvider } from '../src/worker/providers/materials/PpsMaterialPriceProvider.ts'
import { PUBLIC_API_PROVIDERS } from '../src/shared/types/integration.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('PPS connection and prices query only today in Korea, including UTC date boundaries', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T15:01:00Z') })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    requests.push(new URL(String(input)))
    return Response.json({ response: { header: { resultCode: '00' }, body: { numOfRows: 1, pageNo: 1, totalCount: 0 } } })
  })
  const provider = new PpsMaterialPriceProvider('synthetic-key')
  assert.match(await provider.healthCheck(), /연결 확인 완료.*조회 결과 없음/)
  await assert.rejects(() => provider.getPrices(['rebar']), /선택한 자재 가격이 없습니다/)
  t.mock.timers.setTime(new Date('2026-12-31T15:01:00Z').getTime())
  assert.match(await provider.healthCheck(), /연결 확인 완료.*조회 결과 없음/)
  assert.deepEqual(requests.map(({ searchParams }) => [searchParams.get('inqryBgnDate'), searchParams.get('inqryEndDate')]), [
    ['20260909', '20260909'], ['20260909', '20260909'], ['20270101', '20270101'],
  ])
})

test('PPS material provider calls the official total endpoint and does not invent a trend', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.origin + url.pathname, 'https://apis.data.go.kr/1230000/ao/PriceInfoService/getPriceInfoListFcltyCmmnMtrilTotal')
    assert.equal(url.searchParams.get('serviceKey'), 'encoded/key=')
    assert.equal(url.searchParams.get('type'), 'json')
    assert.equal(url.searchParams.get('pageNo'), '1')
    assert.equal(url.searchParams.get('numOfRows'), '1000')
    assert.equal(url.searchParams.get('inqryDiv'), '1')
    assert.match(url.searchParams.get('inqryBgnDate') ?? '', /^\d{8}$/)
    assert.match(url.searchParams.get('inqryEndDate') ?? '', /^\d{8}$/)
    assert.ok(url.searchParams.get('inqryBgnDate') <= url.searchParams.get('inqryEndDate'))
    return new Response(JSON.stringify({
      header: { resultCode: '00' },
      body: {
        items: [
          { prdctClsfcNoNm: '철근', krnPrdctNm: '이형철근 SD400 D10', prce: '765000', unit: 'ton', nticeDt: '20260801' },
          { prdctClsfcNoNm: '시멘트', krnPrdctNm: '포틀랜드 시멘트', prce: '110000', unit: 'ton', nticeDt: '20260801' },
        ],
      },
    }))
  }

  try {
    const prices = await new PpsMaterialPriceProvider('encoded%2Fkey%3D').getPrices(['rebar', 'cement'])
    assert.deepEqual(prices.map(({ materialKey, price, hasTrend, isMock, updatedAt }) => ({ materialKey, price, hasTrend, isMock, updatedAt })), [
      { materialKey: 'rebar', price: 765000, hasTrend: false, isMock: false, updatedAt: '20260801' },
      { materialKey: 'cement', price: 110000, hasTrend: false, isMock: false, updatedAt: '20260801' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PPS material provider keeps supporting the nested response envelope', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: {
      header: { resultCode: '00' },
      body: { items: [{ prdctClsfcNoNm: '시멘트', krnPrdctNm: '포틀랜드 시멘트', prce: '110000', unit: 'ton' }] },
    },
  }))
  try {
    const [price] = await new PpsMaterialPriceProvider('key').getPrices(['cement'])
    assert.equal(price.price, 110000)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PPS material provider rejects invalid upstream responses so the route can use Mock fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ header: { resultCode: '30' }, body: { detail: 'must-not-leak' } }))
  try {
    await assert.rejects(
      () => new PpsMaterialPriceProvider('key').getPrices(['rebar']),
      (error) => error instanceof Error && /HTTP 200, 코드 30/.test(error.message) && !error.message.includes('must-not-leak'),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PPS material provider rejects an empty successful response so the route can use Mock fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ header: { resultCode: '00' }, body: { items: [] } }))
  try {
    await assert.rejects(
      () => new PpsMaterialPriceProvider('key').getPrices(['rebar']),
      /선택한 자재 가격이 없습니다/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('material widgets persist user-selected materials and hide unavailable live trends', () => {
  const prices = read('src/client/widgets/MaterialPriceWidget.tsx')
  const summary = read('src/client/widgets/MarketSummaryWidget.tsx')
  const route = read('src/worker/routes/material-prices.ts')
  const registry = read('src/worker/providers/materials/index.ts')

  for (const widget of [prices, summary]) {
    assert.match(widget, /settings/)
    assert.match(widget, /onSettingsChange/)
    assert.match(widget, /materialKeys/)
    assert.match(widget, /type="checkbox"/)
  }
  assert.match(prices, /m\.hasTrend/)
  assert.match(summary, /hasTrend/)
  assert.match(registry, /G2B_SERVICE_KEY/)
  assert.match(route, /MockMaterialPriceProvider/)
  assert.match(route, /조달청 가격정보현황서비스/)
})

test('material prices have a dedicated admin integration and prefer its credential with G2B fallback', () => {
  const provider = PUBLIC_API_PROVIDERS.find((item) => item.key === 'material_prices')
  const registry = read('src/worker/providers/materials/index.ts')
  const adminRoute = read('src/worker/routes/admin/integrations.ts')

  assert.deepEqual(provider, {
    key: 'material_prices',
    label: '건설시장·주요자재가격(조달청)',
    envVar: 'MATERIAL_PRICE_SERVICE_KEY / G2B_SERVICE_KEY',
    docsUrl: 'https://www.data.go.kr/data/15129415/openapi.do',
  })
  assert.match(registry, /getDecryptedCredential<\{ apiKey: string \}>\('material_prices'\)/)
  assert.match(registry, /materialCredential\?\.apiKey \|\| g2bCredential\?\.apiKey \|\| env\.MATERIAL_PRICE_SERVICE_KEY \|\| env\.G2B_SERVICE_KEY/)
  assert.match(adminRoute, /case 'material_prices'/)
  assert.match(adminRoute, /PpsMaterialPriceProvider/)
  assert.match(adminRoute, /healthCheck\(\)/)
})
