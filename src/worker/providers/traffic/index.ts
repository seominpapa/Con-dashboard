import type { Bindings } from '../../env'
import { getAuthSecretFromEnv } from '../../auth/session'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { ItsTrafficProvider } from './ItsTrafficProvider'

export async function getTrafficProvider(env: Bindings): Promise<ItsTrafficProvider> {
  const repo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const stored = await repo.getDecryptedCredential<{ apiKey: string }>('its').catch(() => null)
  const apiKey = stored?.apiKey || env.ITS_API_KEY
  if (!apiKey) throw new Error('관리자가 ITS API 키를 설정해야 합니다')
  return new ItsTrafficProvider(apiKey)
}

export { ItsTrafficProvider }
