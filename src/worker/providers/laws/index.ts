import type { Bindings } from '../../env'
import type { LawProvider } from './LawProvider'
import { NlicLawProvider } from './NlicLawProvider'
import { MockLawProvider } from './MockLawProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

export async function getLawProvider(env: Bindings): Promise<LawProvider> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const dbCred = await integrationRepo.getDecryptedCredential<{ apiKey: string }>('law').catch(() => null)
  const apiKey = dbCred?.apiKey || env.LAW_API_KEY
  if (apiKey) {
    return new NlicLawProvider(apiKey)
  }
  return new MockLawProvider()
}

export * from './LawProvider'
