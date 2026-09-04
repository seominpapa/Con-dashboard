import type { ExchangeRateItem } from '../../../shared/types/market'
import type { DataSource } from '../../../shared/types/common'

export interface ExchangeRateProvider {
  readonly source: DataSource
  getRates(codes: string[]): Promise<ExchangeRateItem[]>
}
