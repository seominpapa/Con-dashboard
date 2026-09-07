import type { Bindings } from '../../env'
import type { LawProvider } from './LawProvider'
import { NlicLawProvider } from './NlicLawProvider'
import { MockLawProvider } from './MockLawProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

export async function getLawProvider(env: Bindings): Promise<LawProvider> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const dbCred = await integrationRepo.getDecryptedCredential<{ oc?: string; apiKey?: string }>('law').catch(() => null)
  const oc = dbCred?.oc || dbCred?.apiKey || env.LAW_OC || env.LAW_API_KEY
  if (oc) {
    return new NlicLawProvider(oc)
  }
  return new MockLawProvider()
}

export * from './LawProvider'
