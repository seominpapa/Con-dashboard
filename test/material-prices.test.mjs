import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { PpsMaterialPriceProvider } from '../src/worker/providers/materials/PpsMaterialPriceProvider.ts'
import { PUBLIC_API_PROVIDERS } from '../src/shared/types/integration.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('PPS queries the last six months in Korea with 999-row pages and stops after a short page', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T15:01:00Z') })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    requests.push(url)
    const page = Number(url.searchParams.get('pageNo'))
    const rows = Number(url.searchParams.get('numOfRows'))
    const items = page === 1 ? Array.from({ length: rows }, (_, i) => ({ prdctClsfcNoNm: '평강', krnPrdctNm: `평강 ${i}`, unit: '톤', prce: String(900000 + i), nticeDt: '2026-04-20 00:00:00' })) : [{ prdctClsfcNoNm: '경량형강', krnPrdctNm: '경량형강, C형강', unit: '톤', prce: '1020000', nticeDt: '2026-04-20 00:00:00' }]
    return Response.json({ response: { header: { resultCode: '00' }, body: { numOfRows: rows, pageNo: page, totalCount: 1000, items } } })
  })
  const provider = new PpsMaterialPriceProvider('synthetic-key')
  assert.match(await provider.healthCheck(), /연결 확인 완료$/)
  assert.deepEqual(requests.map(({ searchParams }) => [searchParams.get('numOfRows'), searchParams.get('pageNo'), searchParams.get('inqryBgnDate'), searchParams.get('inqryEndDate')]), [['1', '1', '20260313', '20260909']])
  const prices = await provider.getPrices(['flat-steel', 'light-steel', 'rebar'])
  assert.deepEqual(requests.slice(1).map(({ searchParams }) => [searchParams.get('numOfRows'), searchParams.get('pageNo')]), [['999', '1'], ['999', '2']])
  assert.deepEqual(prices.map(({ materialKey, price, spec, unit, updatedAt, isMock }) => ({ materialKey, price, spec, unit, updatedAt, isMock })), [
    { materialKey: 'flat-steel', price: 900499, spec: '평강 499', unit: 'ton', updatedAt: '2026-04-20', isMock: false },
    { materialKey: 'light-steel', price: 1020000, spec: '경량형강, C형강', unit: 'ton', updatedAt: '2026-04-20', isMock: false },
  ])
})

test('PPS material provider calls the official total endpoint, matches the product class and unit, and does not invent a trend', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    assert.equal(url.origin + url.pathname, 'https://apis.data.go.kr/1230000/ao/PriceInfoService/getPriceInfoListFcltyCmmnMtrilTotal')
    assert.equal(url.searchParams.get('serviceKey'), 'encoded/key=')
    assert.equal(url.searchParams.get('type'), 'json')
    assert.equal(url.searchParams.get('inqryDiv'), '1')
    assert.match(url.searchParams.get('inqryBgnDate') ?? '', /^\d{8}$/)
    assert.ok(url.searchParams.get('inqryBgnDate') <= url.searchParams.get('inqryEndDate'))
    return new Response(JSON.stringify({
      header: { resultCode: '00' },
      body: { items: [
        { prdctClsfcNoNm: '일반구조용압연강판', krnPrdctNm: '일반구조용압연강판, 3mm', prce: '851', unit: 'kg', nticeDt: '2026-04-20 00:00:00' },
        { prdctClsfcNoNm: '일반구조용압연강판', krnPrdctNm: '일반구조용압연강판, 40mm', prce: '1008909', unit: '톤', nticeDt: '2026-04-20 00:00:00' },
        { prdctClsfcNoNm: '일반구조용 압연강판', krnPrdctNm: '일반구조용압연강판, 41mm', prce: '1018413', unit: '톤', nticeDt: '2026-04-20 00:00:00' },
        { prdctClsfcNoNm: '접지판', krnPrdctNm: '동판, 2.0×300×300mm', prce: '16489', unit: '개', nticeDt: '2026-04-20 00:00:00' },
      ] },
    }))
  })
  const prices = await new PpsMaterialPriceProvider('encoded%2Fkey%3D').getPrices(['steel-plate', 'copper'])
  assert.deepEqual(prices.map(({ materialKey, price, spec, hasTrend, isMock, updatedAt }) => ({ materialKey, price, spec, hasTrend, isMock, updatedAt })), [
    { materialKey: 'steel-plate', price: 1018413, spec: '일반구조용압연강판, 41mm', hasTrend: false, isMock: false, updatedAt: '2026-04-20' },
  ])
})

test('PPS material provider keeps supporting the nested response envelope and range errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    response: { header: { resultCode: '00' }, body: { items: [{ prdctClsfcNoNm: '모르타르', krnPrdctNm: '무수축모르타르', prce: '320', unit: 'kg' }] } },
  })))
  const [price] = await new PpsMaterialPriceProvider('key').getPrices(['mortar'])
  assert.equal(price.price, 320)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ 'nkoneps.com.response.ResponseError': { header: { resultCode: '07', resultMsg: '입력범위값 초과 에러' } } })))
  await assert.rejects(() => new PpsMaterialPriceProvider('key').getPrices(['mortar']), /코드 07/)
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

test('PPS material provider returns no items for an empty successful response so the route fills Mock per material', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ header: { resultCode: '00' }, body: { items: [] } }))
  try {
    assert.deepEqual(await new PpsMaterialPriceProvider('key').getPrices(['rebar', 'steel-plate']), [])
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
