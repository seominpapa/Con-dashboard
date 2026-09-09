import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getMaterialPriceProvider } from '../providers/materials'
import { PpsMaterialPriceProvider, type PpsPriceRow } from '../providers/materials/PpsMaterialPriceProvider'
import { CACHE_TTL } from '../cache/memoryCache'
import { withWidgetSnapshot } from '../cache/widgetSnapshot'
import { ok } from '../../shared/types/common'
import { MATERIAL_CATALOG } from '../../shared/types/market'
import { MockMaterialPriceProvider } from '../providers/materials/MockMaterialPriceProvider'
import type { MaterialPriceItem } from '../../shared/types/market'
import { getExchangeRateProvider } from '../providers/exchange'
import { EcosExchangeRateProvider } from '../providers/exchange/EcosExchangeRateProvider'

const app = new Hono<AppEnv>()

const latestDate = (items: MaterialPriceItem[]) => items.filter((item) => !item.isMock).map((item) => item.updatedAt).sort().at(-1)

async function addProducerPriceIndices(env: AppEnv['Bindings'], items: MaterialPriceItem[]): Promise<MaterialPriceItem[]> {
  const provider = await getExchangeRateProvider(env)
  if (!(provider instanceof EcosExchangeRateProvider)) return items
  const indices = await provider.getProducerPriceIndices(items.map((item) => item.materialKey)).catch(() => [])
  return items.map((item) => {
    const index = indices.find((entry) => entry.materialKey === item.materialKey)
    return index ? { ...item, producerPriceIndex: { value: index.value, changeRate: index.changeRate, asOf: index.asOf } } : item
  })
}

// GET /api/material-prices?keys=rebar,cement
app.get('/', async (c) => {
  const keysParam = c.req.query('keys')
  const allowed = new Set(MATERIAL_CATALOG.map((m) => m.key))
  const requestedKeys = (keysParam ? keysParam.split(',') : MATERIAL_CATALOG.slice(0, 6).map((m) => m.key))
    .filter((key) => allowed.has(key))
    .slice(0, 6)
  const keys = requestedKeys.length ? requestedKeys : MATERIAL_CATALOG.slice(0, 6).map((m) => m.key)

  const provider = await getMaterialPriceProvider(c.env)
  const mock = new MockMaterialPriceProvider()
  const mockMessage = '조달청 가격정보현황서비스 미승인 또는 응답 실패로 참고용 Mock 데이터를 표시합니다.'
  if (!(provider instanceof PpsMaterialPriceProvider)) {
    const value = await addProducerPriceIndices(c.env, await mock.getPrices(keys))
    return c.json(ok(value, 'mock', mockMessage))
  }

  // 가격표는 위젯·현장과 무관하게 하나이므로 한 번만 받아 모든 위젯이 공유하고, 조달청 장애 때는 저장된 표를 쓴다.
  let table
  try {
    table = await withWidgetSnapshot<PpsPriceRow[]>(c.env.DB, 'widget:pps-price-table', 'v1', CACHE_TTL.material, 30 * 24 * 60 * 60 * 1000,
      () => provider.getPriceTable(), (rows) => Array.isArray(rows) && rows.length > 0)
  } catch {
    return c.json(ok(await mock.getPrices(keys), 'mock', mockMessage))
  }
  const live = await provider.getPrices(keys, table.data ?? [])
  // 조달청 시설자재 목록에 없는 자재(철근·시멘트 등)만 Mock으로 채우고 항목별 isMock으로 구분한다.
  const missing = keys.filter((key) => !live.some((item) => item.materialKey === key))
  const filler = missing.length ? (await mock.getPrices(missing)).map((item) => ({ ...item, source: '조달청 미제공 자재 · 참고용 Mock' })) : []
  const value = await addProducerPriceIndices(c.env, keys.flatMap((key) => live.find((item) => item.materialKey === key) ?? filler.filter((item) => item.materialKey === key)))
  const allMock = value.every((item) => item.isMock)
  const message = allMock ? '선택한 자재는 조달청 가격정보현황서비스가 제공하지 않아 참고용 Mock 데이터를 표시합니다.'
    : `조달청 나라장터 가격정보현황서비스의 공공 기준가격입니다 (고시일 ${latestDate(value)}).`
  return c.json({ ...ok(value, allMock ? 'mock' : 'live', message), cached: table.cached, stale: table.stale, asOf: latestDate(value) })
})

export default app
