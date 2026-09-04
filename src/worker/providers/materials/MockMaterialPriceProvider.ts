import type { MaterialPriceProvider } from './MaterialPriceProvider'
import type { MaterialPriceItem, TrendDirection } from '../../../shared/types/market'
import { MATERIAL_CATALOG } from '../../../shared/types/market'
import { seededRandom, range, hourSeed } from '../mockRandom'

/**
 * 주요자재가격 Mock Provider
 *
 * ⚠️ 중요: 자재가격은 자재별로 공식 데이터 출처가 상이하고(예: 철근/H형강은
 * 대한건설협회 물가정보, 시멘트는 업계 발표 등), 상업적 이용이 허용된 API를
 * 아직 확보하지 못한 상태이므로 Mock 데이터를 사용한다.
 * 절대로 임의의 실제 가격처럼 보이는 값을 확정적으로 제공하지 않으며,
 * isMock=true 플래그와 source 문구로 개발/Mock 상태임을 명확히 알린다.
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
  'crude-oil': 82,
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
        source: '개발용 Mock 데이터 (공식 API 미연동)',
        updatedAt: new Date().toISOString(),
        isMock: true,
      }
    })
  }
}
