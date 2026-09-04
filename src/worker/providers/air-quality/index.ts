import type { Bindings } from '../../env'
import type { AirQualityProvider } from './AirQualityProvider'
import { AirKoreaProvider } from './AirKoreaProvider'
import { MockAirQualityProvider } from './MockAirQualityProvider'

export function getAirQualityProvider(env: Bindings): AirQualityProvider {
  if (env.AIRKOREA_SERVICE_KEY) {
    return new AirKoreaProvider(env.AIRKOREA_SERVICE_KEY)
  }
  return new MockAirQualityProvider()
}

export * from './AirQualityProvider'
