import type { MaterialPriceProvider } from './MaterialPriceProvider'
import type { MaterialPriceItem, TrendDirection } from '../../../shared/types/market'
import { MATERIAL_CATALOG } from '../../../shared/types/market'
import { seededRandom, range, hourSeed } from '../mockRandom'

/**
 * 조달청 서비스 미승인/오류 때만 쓰는 참고용 Mock Provider.
 * isMock=true와 source로 실제 기준가격과 명확히 구분한다.
 */
const BASE_PRICE: Record<string, number> = {
  rebar: 740000,
  'h-beam': 980000,
  'steel-plate': 850000,
  copper: 11500000,
  aluminum: 3100000,
  cement: 105000,
  remicon: 82000,
  asphalt: 620000,
  aggregate: 18000,
  lumber: 320000,
  nickel: 21000000,
}

export class MockMaterialPriceProvider implements MaterialPriceProvider {
  readonly source = 'mock' as const

  async getPrices(materialKeys: string[]): Promise<MaterialPriceItem[]> {
    const catalog = MATERIAL_CATALOG.filter((m) => materialKeys.includes(m.key))
    return catalog.map((m) => {
      const base = BASE_PRICE[m.key] ?? 100000
      const rnd = seededRandom(`material-${m.key}-${hourSeed()}`)
      const changeRate = Math.round(range(rnd, -3, 3) * 100) / 100
      const price = Math.round(base * (1 + changeRate / 100))
      const direction: TrendDirection = changeRate > 0.1 ? 'up' : changeRate < -0.1 ? 'down' : 'flat'
      return {
        materialKey: m.key,
        label: m.label,
        price,
        unit: m.unit,
        currency: 'KRW',
        changeRate,
        direction,
        hasTrend: true,
        source: '개발용 Mock 데이터 (공식 API 미연동)',
        updatedAt: new Date().toISOString(),
        isMock: true,
      }
    })
  }
}
