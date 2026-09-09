import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getMaterialPriceProvider } from '../providers/materials'
import { PpsMaterialPriceProvider, type PpsPriceRow } from '../providers/materials/PpsMaterialPriceProvider'
import { CACHE_TTL } from '../cache/memoryCache'
import { withWidgetSnapshot } from '../cache/widgetSnapshot'
import { ok } from '../../shared/types/common'
import { MATERIAL_CATALOG } from '../../shared/types/market'
import type { MaterialPriceItem } from '../../shared/types/market'
import { getExchangeRateProvider } from '../providers/exchange'
import { EcosExchangeRateProvider } from '../providers/exchange/EcosExchangeRateProvider'

const app = new Hono<AppEnv>()

const latestDate = (items: MaterialPriceItem[]) => items.filter((item) => !item.isMock && !item.indexOnly).map((item) => item.updatedAt).sort().at(-1)

async function getProducerPriceIndices(env: AppEnv['Bindings'], keys: string[]) {
  const provider = await getExchangeRateProvider(env)
  return provider instanceof EcosExchangeRateProvider ? provider.getProducerPriceIndices(keys).catch(() => []) : []
}

function addProducerPriceIndices(items: MaterialPriceItem[], indices: Awaited<ReturnType<EcosExchangeRateProvider['getProducerPriceIndices']>>): MaterialPriceItem[] {
  return items.map((item) => {
    const index = indices.find((entry) => entry.materialKey === item.materialKey)
    return index ? { ...item, producerPriceIndex: { value: index.value, changeRate: index.changeRate, asOf: index.asOf } } : item
  })
}

function indexOnlyMaterials(keys: string[], indices: Awaited<ReturnType<EcosExchangeRateProvider['getProducerPriceIndices']>>): MaterialPriceItem[] {
  return keys.flatMap((materialKey) => {
    const index = indices.find((entry) => entry.materialKey === materialKey)
    const catalog = MATERIAL_CATALOG.find((item) => item.key === materialKey)
    if (!index || !catalog) return []
    return [{
      materialKey,
      label: catalog.label,
      price: 0,
      unit: '지수',
      currency: 'INDEX',
      changeRate: index.changeRate,
      direction: index.changeRate > 0 ? 'up' : index.changeRate < 0 ? 'down' : 'flat',
      hasTrend: false,
      source: '한국은행 ECOS 생산자물가지수',
      updatedAt: index.asOf,
      isMock: false,
      indexOnly: true,
      producerPriceIndex: { value: index.value, changeRate: index.changeRate, asOf: index.asOf },
    }]
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
  const priceKeys = keys.filter((key) => MATERIAL_CATALOG.find((item) => item.key === key)?.pps)
  const indices = await getProducerPriceIndices(c.env, keys)
  if (!(provider instanceof PpsMaterialPriceProvider)) {
    return c.json(ok(indexOnlyMaterials(keys, indices), 'live', '조달청 기준가격을 확인할 수 없어 한국은행 ECOS 생산자물가지수만 표시합니다.'))
  }

  // 가격표는 위젯·현장과 무관하게 하나이므로 한 번만 받아 모든 위젯이 공유하고, 조달청 장애 때는 저장된 표를 쓴다.
  let table
  try {
    table = await withWidgetSnapshot<PpsPriceRow[]>(c.env.DB, 'widget:pps-price-table', 'v1', CACHE_TTL.material, 30 * 24 * 60 * 60 * 1000,
      () => provider.getPriceTable(), (rows) => Array.isArray(rows) && rows.length > 0)
  } catch {
    return c.json(ok(indexOnlyMaterials(keys, indices), 'live', '조달청 기준가격을 불러오지 못해 한국은행 ECOS 생산자물가지수만 표시합니다.'))
  }
  const live = await provider.getPrices(priceKeys, table.data ?? [])
  const prices = addProducerPriceIndices(live, indices)
  // 조달청 기준가격이 없는 모든 자재는 추정 가격을 만들지 않고 ECOS 지수만 표시한다.
  const value = keys.flatMap((key) => prices.filter((item) => item.materialKey === key).concat(prices.some((item) => item.materialKey === key) ? [] : indexOnlyMaterials([key], indices)))
  const asOf = latestDate(value)
  const message = asOf ? `조달청 나라장터 가격정보현황서비스의 공공 기준가격입니다 (고시일 ${asOf}).`
    : '조달청 기준가격이 없어 한국은행 ECOS 생산자물가지수만 표시합니다.'
  return c.json({ ...ok(value, 'live', message), cached: table.cached, stale: table.stale, asOf })
})

export default app
