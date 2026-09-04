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
