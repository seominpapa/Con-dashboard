import type { Bindings } from '../../env'
import type { WeatherProvider } from './WeatherProvider'
import { KmaWeatherProvider } from './KmaWeatherProvider'
import { MockWeatherProvider } from './MockWeatherProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

/**
 * 관리자 DB 연결(Integration) 우선 -> 환경변수(ENV) 폴백 순서로 Credential을 조회한다.
 * 둘 다 없으면 Mock Provider를 반환하여 개발환경에서도 항상 정상 동작한다 (기획 0, 53번).
 * 관리자가 /admin/integrations에서 연결을 완료하면 코드 재배포 없이 즉시 활성화된다.
 */
export async function getWeatherProvider(env: Bindings): Promise<WeatherProvider> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const dbCred = await integrationRepo.getDecryptedCredential<{ apiKey: string }>('kma').catch(() => null)
  const apiKey = dbCred?.apiKey || env.KMA_SERVICE_KEY
  if (apiKey) {
    return new KmaWeatherProvider(apiKey)
  }
  return new MockWeatherProvider()
}

export * from './WeatherProvider'
