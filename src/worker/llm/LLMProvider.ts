/**
 * LLM Provider 추상 인터페이스 (기획 35번)
 * ClaudeProvider, CodexProvider가 이 인터페이스를 구현한다.
 * 향후 Gemini, OpenRouter, Local LLM 등을 추가해도 이 인터페이스만 지키면 된다.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMGenerateOptions {
  /** JSON 구조화 출력을 강제할지 여부 (기획 44번 Structured Output) */
  jsonMode?: boolean
  maxTokens?: number
  temperature?: number
}

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
}

export interface LLMResult {
  text: string
  model: string
  usage: LLMUsage
}

export interface LLMProvider {
  readonly key: 'claude' | 'codex'
  readonly label: string

  /** 임의 context를 기반으로 브리핑 텍스트/구조를 생성 */
  generateBriefing(systemPrompt: string, userPrompt: string, options?: LLMGenerateOptions): Promise<LLMResult>

  /** 향후 채팅 확장을 위한 범용 인터페이스 */
  chat(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResult>

  /** 연결 테스트 (관리자 화면의 "연결 테스트" 버튼) */
  healthCheck(): Promise<{ ok: boolean; message?: string }>

  getAvailableModels(): string[]
}

export function formatProviderHttpError(provider: string, status: number, detail?: { code?: string; param?: string }): string {
  if (status === 401 || status === 403) return `${provider} 인증에 실패했습니다`
  if (status === 429 && detail?.code === 'insufficient_quota') return `${provider} 크레딧 또는 프로젝트 사용 한도를 확인해 주세요`
  if (status === 429) return `${provider} 요청 한도를 초과했습니다`
  if (status === 400 && detail?.param === 'max_completion_tokens') return `${provider} 출력 토큰 설정이 올바르지 않습니다`
  if (status === 400 && detail?.param === 'temperature') return `${provider} 모델이 temperature 설정을 지원하지 않습니다`
  if (status >= 500) return `${provider} 서비스가 일시적으로 응답하지 않습니다`
  return `${provider} 요청에 실패했습니다 (${status})`
}
