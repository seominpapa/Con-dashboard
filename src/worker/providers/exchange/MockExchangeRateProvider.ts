import type { ExchangeRateProvider } from './ExchangeRateProvider'
import type { ExchangeRateItem, TrendDirection } from '../../../shared/types/market'
import { seededRandom, range, hourSeed } from '../mockRandom'

const BASE_RATES: Record<string, { label: string; base: number }> = {
  USD: { label: 'USD/KRW', base: 1380 },
  EUR: { label: 'EUR/KRW', base: 1500 },
  JPY: { label: 'JPY/KRW', base: 9.2 },
  CNY: { label: 'CNY/KRW', base: 190 },
}

function buildTrend(rnd: () => number, base: number, points: number) {
  return Array.from({ length: points }).map((_, i) => ({
    label: `D-${points - i}`,
    value: Math.round((base + range(rnd, -base * 0.02, base * 0.02)) * 100) / 100,
  }))
}

export class MockExchangeRateProvider implements ExchangeRateProvider {
  readonly source = 'mock' as const

  async getRates(codes: string[]): Promise<ExchangeRateItem[]> {
    const targets = codes.length ? codes : Object.keys(BASE_RATES)
    return targets
      .filter((c) => BASE_RATES[c])
      .map((code) => {
        const meta = BASE_RATES[code]
        const rnd = seededRandom(`fx-${code}-${hourSeed()}`)
        const changeValue = Math.round(range(rnd, -meta.base * 0.01, meta.base * 0.01) * 100) / 100
        const rate = Math.round((meta.base + changeValue) * 100) / 100
        const direction: TrendDirection = changeValue > 0.01 ? 'up' : changeValue < -0.01 ? 'down' : 'flat'
        return {
          code,
          pairLabel: meta.label,
          rate,
          changeValue,
          changeRate: Math.round((changeValue / meta.base) * 10000) / 100,
          direction,
          weeklyTrend: buildTrend(rnd, meta.base, 7),
          monthlyTrend: buildTrend(rnd, meta.base, 30),
        }
      })
  }
}
