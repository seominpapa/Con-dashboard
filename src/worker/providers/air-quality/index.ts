import type { Bindings } from '../../env'
import type { AirQualityProvider } from './AirQualityProvider'
import { AirKoreaProvider } from './AirKoreaProvider'
import { MockAirQualityProvider } from './MockAirQualityProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

export async function getAirQualityProvider(env: Bindings): Promise<AirQualityProvider> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const dbCred = await integrationRepo.getDecryptedCredential<{ apiKey: string }>('airkorea').catch(() => null)
  const apiKey = dbCred?.apiKey || env.AIRKOREA_SERVICE_KEY
  if (apiKey) {
    return new AirKoreaProvider(apiKey)
  }
  return new MockAirQualityProvider()
}

export * from './AirQualityProvider'
