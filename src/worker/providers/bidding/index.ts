import type { Bindings } from '../../env'
import type { BidProvider } from './BidProvider'
import { G2bBidProvider } from './G2bBidProvider'
import { MockBidProvider } from './MockBidProvider'

export function getBidProvider(env: Bindings): BidProvider {
  if (env.G2B_SERVICE_KEY) {
    return new G2bBidProvider(env.G2B_SERVICE_KEY)
  }
  return new MockBidProvider()
}

export * from './BidProvider'
