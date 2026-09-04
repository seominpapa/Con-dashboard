import type { Bindings } from '../../env'
import type { ExchangeRateProvider } from './ExchangeRateProvider'
import { EcosExchangeRateProvider } from './EcosExchangeRateProvider'
import { MockExchangeRateProvider } from './MockExchangeRateProvider'

export function getExchangeRateProvider(env: Bindings): ExchangeRateProvider {
  if (env.ECOS_API_KEY) {
    return new EcosExchangeRateProvider(env.ECOS_API_KEY)
  }
  return new MockExchangeRateProvider()
}

export * from './ExchangeRateProvider'
