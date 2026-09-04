import type { BidNotice, BidFilter } from '../../../shared/types/bidding'
import type { DataSource } from '../../../shared/types/common'

export interface BidProvider {
  readonly source: DataSource
  searchBids(filter: Partial<BidFilter>, limit?: number): Promise<BidNotice[]>
}
