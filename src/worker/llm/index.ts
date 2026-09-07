import type { Bindings } from '../env'
import type { LLMProvider } from './LLMProvider'
import { ClaudeProvider } from './ClaudeProvider'
import { CodexProvider } from './CodexProvider'
import { IntegrationRepository } from '../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../auth/session'
import { selectLLMCredential } from './CredentialAdapter'

export type LLMProviderKey = 'claude' | 'codex'

export function createLLMProvider(providerKey: LLMProviderKey, apiKey: string, model?: string): LLMProvider {
  return providerKey === 'claude' ? new ClaudeProvider(apiKey) : new CodexProvider(apiKey, model)
}

/**
 * LLM Provider 인스턴스 생성 (관리자 DB 연결 우선, ENV 폴백)
 * 관리자가 /admin/integrations/ai 에서 연결을 완료하면 코드 재배포 없이
 * 즉시 사용 가능해진다 (기획 53번 - DB 우선 조회).
 */
export async function getLLMProvider(env: Bindings, providerKey: LLMProviderKey): Promise<LLMProvider | null> {
  let storedConfigured = false
  let storedApiKey: string | null = null
  let storedModel: string | undefined
  try {
    const integrationRepo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
    const summary = await integrationRepo.getSummary(providerKey)
    storedConfigured = Boolean(summary?.connectedAt && summary.status !== 'DISCONNECTED')
    if (storedConfigured) {
      const credential = await integrationRepo.getDecryptedCredential<{ apiKey?: unknown; model?: unknown }>(providerKey)
      storedApiKey = typeof credential?.apiKey === 'string' && credential.apiKey ? credential.apiKey : null
      storedModel = typeof credential?.model === 'string' ? credential.model : undefined
    }
  } catch {
    return null
  }

  const envApiKey = providerKey === 'claude' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY
  const apiKey = selectLLMCredential(storedConfigured, storedApiKey, envApiKey)
  if (!apiKey) return null

  return createLLMProvider(providerKey, apiKey, storedModel)
}

/** 관리자가 지정한 기본 Provider를 가져온다. 없으면 연결된 Provider 중 하나를 자동 선택 */
export async function getDefaultLLMProvider(env: Bindings): Promise<LLMProvider | null> {
  const { SettingsRepository, SETTINGS_KEY } = await import('../repositories/SettingsRepository')
  const settingsRepo = new SettingsRepository(env.DB)
  const defaultKey = (await settingsRepo.get(SETTINGS_KEY.DEFAULT_LLM_PROVIDER)) as LLMProviderKey | null

  if (defaultKey) {
    const provider = await getLLMProvider(env, defaultKey)
    if (provider) return provider
  }

  // 기본값 미설정 시: claude -> codex 순으로 연결된 것 사용
  const claude = await getLLMProvider(env, 'claude')
  if (claude) return claude
  const codex = await getLLMProvider(env, 'codex')
  if (codex) return codex
  return null
}

export * from './LLMProvider'
export * from './CredentialAdapter'
