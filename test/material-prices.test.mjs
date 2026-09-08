import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { PpsMaterialPriceProvider } from '../src/worker/providers/materials/PpsMaterialPriceProvider.ts'
import { PUBLIC_API_PROVIDERS } from '../src/shared/types/integration.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('PPS material provider calls the official total endpoint and does not invent a trend', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.origin + url.pathname, 'https://apis.data.go.kr/1230000/ao/PriceInfoService/getPriceInfoListFcltyCmmnMtrilTotal')
    assert.equal(url.searchParams.get('serviceKey'), 'encoded/key=')
    assert.equal(url.searchParams.get('type'), 'json')
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: '00' },
        body: {
          items: [
            { itemNm: '이형철근 SD400 D10', unitPrce: '765000', unit: 'ton', stdrDt: '2026-08-01' },
            { itemNm: '포틀랜드 시멘트', unitPrce: '110000', unit: 'ton', stdrDt: '2026-08-01' },
          ],
        },
      },
    }))
  }

  try {
    const prices = await new PpsMaterialPriceProvider('encoded%2Fkey%3D').getPrices(['rebar', 'cement'])
    assert.deepEqual(prices.map(({ materialKey, price, hasTrend, isMock }) => ({ materialKey, price, hasTrend, isMock })), [
      { materialKey: 'rebar', price: 765000, hasTrend: false, isMock: false },
      { materialKey: 'cement', price: 110000, hasTrend: false, isMock: false },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PPS material provider rejects invalid upstream responses so the route can use Mock fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ response: { header: { resultCode: '30' } } }))
  try {
    await assert.rejects(() => new PpsMaterialPriceProvider('key').getPrices(['rebar']), /PPS API resultCode=30/)
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
  assert.match(adminRoute, /getPrices\(\['rebar'\]\)/)
})
