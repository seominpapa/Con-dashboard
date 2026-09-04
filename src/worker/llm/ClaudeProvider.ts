import type { LLMProvider, LLMMessage, LLMGenerateOptions, LLMResult } from './LLMProvider'

const API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'

/**
 * Claude Provider (Anthropic 공식 Messages API 사용)
 * 인증은 CredentialAdapter(ClaudeCredentialAdapter)가 준비한 apiKey를 그대로 사용한다.
 * CLI OAuth 세션 파일을 임의로 읽어 사용하는 방식은 사용하지 않는다 (기획 36번 원칙).
 */
export class ClaudeProvider implements LLMProvider {
  readonly key = 'claude' as const
  readonly label = 'Claude'
  private model: string

  constructor(private apiKey: string, model?: string) {
    this.model = model || DEFAULT_MODEL
  }

  private async callApi(system: string | undefined, messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResult> {
    const body: any = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.4,
      messages: messages.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
    }
    if (system) body.system = system

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Claude API 오류 (${res.status}): ${text.slice(0, 200)}`)
    }
    const json: any = await res.json()
    const text = (json.content ?? []).map((b: any) => b.text ?? '').join('')
    return {
      text,
      model: json.model ?? this.model,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    }
  }

  async generateBriefing(systemPrompt: string, userPrompt: string, options?: LLMGenerateOptions): Promise<LLMResult> {
    return this.callApi(systemPrompt, [{ role: 'user', content: userPrompt }], options)
  }

  async chat(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResult> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const rest = messages.filter((m) => m.role !== 'system')
    return this.callApi(systemMsg?.content, rest, options)
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const result = await this.callApi(undefined, [{ role: 'user', content: 'ping' }], { maxTokens: 8 })
      return { ok: true, message: `연결 확인 완료 (model: ${result.model})` }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  }

  getAvailableModels(): string[] {
    return ['claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-haiku-4-5-20251001']
  }
}
