import type { Bindings } from '../../env'
import type { MaterialPriceProvider } from './MaterialPriceProvider'
import { MockMaterialPriceProvider } from './MockMaterialPriceProvider'
import { PpsMaterialPriceProvider } from './PpsMaterialPriceProvider'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../../auth/session'

/** 관리자 연결 테스트와 실제 조회가 같은 우선순위로 키를 선택한다. */
export async function getMaterialPriceCredential(env: Bindings): Promise<{ apiKey: string } | null> {
  const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const [materialCredential, g2bCredential] = await Promise.all([
    integrationRepo.getDecryptedCredential<{ apiKey: string }>('material_prices').catch(() => null),
    integrationRepo.getDecryptedCredential<{ apiKey: string }>('g2b').catch(() => null),
  ])
  const apiKey = materialCredential?.apiKey || g2bCredential?.apiKey || env.MATERIAL_PRICE_SERVICE_KEY || env.G2B_SERVICE_KEY
  return apiKey ? { apiKey } : null
}

/** 조달청 연동 자격증명이 없으면 명확히 표시된 Mock 데이터를 사용한다. */
export async function getMaterialPriceProvider(env: Bindings): Promise<MaterialPriceProvider> {
  const credential = await getMaterialPriceCredential(env)
  if (credential) return new PpsMaterialPriceProvider(credential.apiKey)
  return new MockMaterialPriceProvider()
}

export * from './MaterialPriceProvider'
