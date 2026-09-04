import type { OilPriceProvider } from './OilPriceProvider'
import type { OilPriceItem, OilKind, TrendDirection } from '../../../shared/types/market'
import { OIL_KIND_LABEL } from '../../../shared/types/market'
import { seededRandom, range, hourSeed } from '../mockRandom'

const BASE_PRICE: Record<OilKind, { price: number; unit: string; currency: string }> = {
  dubai: { price: 82, unit: 'barrel', currency: 'USD' },
  wti: { price: 78, unit: 'barrel', currency: 'USD' },
  brent: { price: 84, unit: 'barrel', currency: 'USD' },
  'domestic-diesel': { price: 1650, unit: 'L', currency: 'KRW' },
  'domestic-gasoline': { price: 1720, unit: 'L', currency: 'KRW' },
}

export class MockOilPriceProvider implements OilPriceProvider {
  readonly source = 'mock' as const

  async getPrices(kinds: OilKind[]): Promise<OilPriceItem[]> {
    const targets = kinds.length ? kinds : (['dubai', 'domestic-diesel'] as OilKind[])
    return targets.map((kind) => {
      const meta = BASE_PRICE[kind]
      const rnd = seededRandom(`oil-${kind}-${hourSeed()}`)
      const changeValue = Math.round(range(rnd, -meta.price * 0.02, meta.price * 0.02) * 100) / 100
      const price = Math.round((meta.price + changeValue) * 100) / 100
      const direction: TrendDirection = changeValue > 0.01 ? 'up' : changeValue < -0.01 ? 'down' : 'flat'
      const trend = Array.from({ length: 7 }).map((_, i) => ({
        label: `D-${7 - i}`,
        value: Math.round((meta.price + range(rnd, -meta.price * 0.03, meta.price * 0.03)) * 100) / 100,
      }))
      return {
        kind,
        label: OIL_KIND_LABEL[kind],
        unit: meta.unit,
        currency: meta.currency,
        price,
        changeValue,
        weeklyChangeRate: Math.round(range(rnd, -3, 3) * 100) / 100,
        monthlyChangeRate: Math.round(range(rnd, -8, 8) * 100) / 100,
        direction,
        trend,
      }
    })
  }
}
