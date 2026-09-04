import type { MaterialPriceItem } from '../../../shared/types/market'
import type { DataSource } from '../../../shared/types/common'

export interface MaterialPriceProvider {
  readonly source: DataSource
  getPrices(materialKeys: string[]): Promise<MaterialPriceItem[]>
}
