import type { Bindings } from '../../env'
import type { ExchangeRateProvider } from './ExchangeRateProvider'
import { EcosExchangeRateProvider } from './EcosExchangeRateProvider'
import { MockExchangeRateProvider } from './MockExchangeRateProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

export async function getExchangeRateProvider(env: Bindings): Promise<ExchangeRateProvider> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const dbCred = await integrationRepo.getDecryptedCredential<{ apiKey: string }>('ecos').catch(() => null)
  const apiKey = dbCred?.apiKey || env.ECOS_API_KEY
  if (apiKey) {
    return new EcosExchangeRateProvider(apiKey)
  }
  return new MockExchangeRateProvider()
}

export * from './ExchangeRateProvider'
