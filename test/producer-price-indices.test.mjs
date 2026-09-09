import test from 'node:test'
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { EcosExchangeRateProvider } = await vite.ssrLoadModule('/src/worker/providers/exchange/EcosExchangeRateProvider.ts')
after(() => vite.close())

test('ECOS 생산자물가 지수는 환율과 같은 인증키로 품목과 월간 지수를 조회한다', async () => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname
    requested.push(path)
    if (path.includes('/StatisticItemList/')) {
      return Response.json({ StatisticItemList: { row: [
        { ITEM_CODE: 'A1', ITEM_NAME: '철근', CYCLE: 'M' },
        { ITEM_CODE: 'B1', ITEM_NAME: '시멘트', CYCLE: 'M' },
      ] } })
    }
    return Response.json({ StatisticSearch: { row: [
      { TIME: '202608', DATA_VALUE: '101.2' },
      { TIME: '202609', DATA_VALUE: '102.0' },
    ] } })
  }
  try {
    const indices = await new EcosExchangeRateProvider('one-ecos-key').getProducerPriceIndices(['rebar', 'cement'])
    assert.deepEqual(indices.map(({ materialKey, value, changeRate, asOf }) => ({ materialKey, value, changeRate, asOf })), [
      { materialKey: 'rebar', value: 102, changeRate: 0.79, asOf: '2026-09' },
      { materialKey: 'cement', value: 102, changeRate: 0.79, asOf: '2026-09' },
    ])
    assert.ok(requested.every((path) => path.includes('/one-ecos-key/')))
  } finally {
    globalThis.fetch = originalFetch
  }
})
