import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { PpsMaterialPriceProvider } from '../src/worker/providers/materials/PpsMaterialPriceProvider.ts'

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
