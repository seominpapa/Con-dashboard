import type { OilPriceItem, OilKind } from '../../../shared/types/market'
import type { DataSource } from '../../../shared/types/common'

export interface OilPriceProvider {
  readonly source: DataSource
  getPrices(kinds: OilKind[]): Promise<OilPriceItem[]>
}
