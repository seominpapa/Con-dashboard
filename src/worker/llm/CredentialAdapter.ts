/**
 * LLM Provider CredentialAdapter 계층 (기획 36번)
 *
 * 목적: 관리자 화면에서는 "[Claude 연결하기]" 같은 단순 UX로 통일하지만,
 * 내부적으로는 Provider 공식 지원 방식(현재는 공식 API Key 방식)에 맞게
 * Credential 준비/검증 로직을 분리한다.
 *
 * 중요 원칙 (기획 36번):
 * - CLI에 저장된 OAuth Credential 파일을 임의로 읽거나 복사해서 서버에서
 *   사용하는 방식은 절대 구현하지 않는다.
 * - Provider의 공식 인증 흐름(공식 API Key 발급 등)만 사용한다.
 * - 향후 공식 OAuth 지원이 열리면 이 Adapter 내부 구현만 교체하면 되고,
 *   상위 IntegrationService/Route는 변경할 필요가 없다.
*/

import { OPENAI_MODELS } from '../../shared/types/integration.ts'

export interface CredentialInput {
  /** 관리자가 입력하는 자격증명 필드 (Provider마다 다름) */
  [key: string]: string
}

export interface CredentialAdapter {
  readonly providerKey: 'claude' | 'codex'
  /** 관리자 UI에 표시할 입력 필드 정의 */
  readonly fields: { key: string; label: string; type: 'text' | 'password'; placeholder?: string }[]
  /** 입력값 형식 검증 (실제 API 호출 없이 빠른 sanity check) */
  validate(input: unknown): { valid: boolean; message?: string }
  /** 저장 전 정규화 (트림 등) */
  normalize(input: CredentialInput): Record<string, string>
}

function validateApiKey(input: unknown): { valid: boolean; message?: string } {
  const apiKey = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>).apiKey : null
  if (typeof apiKey !== 'string' || apiKey.trim().length < 10 || apiKey.length > 4096) {
    return { valid: false, message: 'API Key 형식이 올바르지 않습니다' }
  }
  return { valid: true }
}

export class ClaudeCredentialAdapter implements CredentialAdapter {
  readonly providerKey = 'claude' as const
  readonly fields = [
    { key: 'apiKey', label: 'Anthropic API Key', type: 'password' as const, placeholder: 'sk-ant-...' },
  ]

  validate(input: unknown) {
    return validateApiKey(input)
  }

  normalize(input: CredentialInput) {
    return { apiKey: input.apiKey.trim() }
  }
}

export class CodexCredentialAdapter implements CredentialAdapter {
  readonly providerKey = 'codex' as const
  readonly fields = [
    { key: 'apiKey', label: 'OpenAI API Key', type: 'password' as const, placeholder: 'sk-...' },
  ]

  validate(input: unknown) {
    const apiKeyResult = validateApiKey(input)
    if (!apiKeyResult.valid) return apiKeyResult
    const model = (input as Record<string, unknown>).model
    return model === undefined || (typeof model === 'string' && OPENAI_MODELS.includes(model as (typeof OPENAI_MODELS)[number]))
      ? { valid: true }
      : { valid: false, message: '지원하지 않는 OpenAI 모델입니다' }
  }

  normalize(input: CredentialInput) {
    const model = OPENAI_MODELS.includes(input.model as (typeof OPENAI_MODELS)[number]) ? input.model : OPENAI_MODELS[0]
    return { apiKey: input.apiKey.trim(), model }
  }
}

export function getCredentialAdapter(providerKey: 'claude' | 'codex'): CredentialAdapter {
  return providerKey === 'claude' ? new ClaudeCredentialAdapter() : new CodexCredentialAdapter()
}

export function selectLLMCredential(storedConfigured: boolean, storedApiKey: string | null, envApiKey?: string): string | null {
  return storedConfigured ? storedApiKey : envApiKey || null
}
