import type { Bindings } from '../../env'
import type { BidProvider } from './BidProvider'
import { G2bBidProvider } from './G2bBidProvider'
import { MockBidProvider } from './MockBidProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

export async function getBidProvider(env: Bindings): Promise<BidProvider> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const dbCred = await integrationRepo.getDecryptedCredential<{ apiKey: string }>('g2b').catch(() => null)
  const apiKey = dbCred?.apiKey || env.G2B_SERVICE_KEY
  if (apiKey) {
    return new G2bBidProvider(apiKey)
  }
  return new MockBidProvider()
}

export * from './BidProvider'
