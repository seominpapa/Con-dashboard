import type { Bindings } from '../../env'
import type { WeatherProvider } from './WeatherProvider'
import { KmaWeatherProvider } from './KmaWeatherProvider'
import { MockWeatherProvider } from './MockWeatherProvider'

/**
 * 환경변수(KMA_SERVICE_KEY) 존재 여부에 따라 실제 Provider 또는 Mock Provider를 반환한다.
 * API 연결이 안 된 개발환경에서도 애플리케이션이 정상 동작하도록 보장한다.
 */
export function getWeatherProvider(env: Bindings): WeatherProvider {
  if (env.KMA_SERVICE_KEY) {
    return new KmaWeatherProvider(env.KMA_SERVICE_KEY)
  }
  return new MockWeatherProvider()
}

export * from './WeatherProvider'
