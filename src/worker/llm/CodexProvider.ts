import { formatProviderHttpError, type LLMProvider, type LLMMessage, type LLMGenerateOptions, type LLMResult } from './LLMProvider'

const API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-5.1'

/**
 * Codex/OpenAI Provider (OpenAI 공식 Chat Completions API 사용)
 * 인증은 CredentialAdapter(CodexCredentialAdapter)가 준비한 apiKey를 그대로 사용한다.
 */
export class CodexProvider implements LLMProvider {
  readonly key = 'codex' as const
  readonly label = 'Codex / OpenAI'
  private model: string

  constructor(private apiKey: string, model?: string) {
    this.model = model || DEFAULT_MODEL
  }

  private async callApi(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResult> {
    const body: any = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role === 'system' ? 'developer' : m.role, content: m.content })),
      temperature: options?.temperature ?? 0.4,
      max_completion_tokens: options?.maxTokens ?? 2000,
    }
    if (options?.jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(formatProviderHttpError('OpenAI', res.status))
    }
    const json: any = await res.json()
    const text = json.choices?.[0]?.message?.content ?? ''
    return {
      text,
      model: json.model ?? this.model,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    }
  }

  async generateBriefing(systemPrompt: string, userPrompt: string, options?: LLMGenerateOptions): Promise<LLMResult> {
    return this.callApi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options
    )
  }

  async chat(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResult> {
    return this.callApi(messages, options)
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const result = await this.callApi([{ role: 'user', content: 'ping' }], { maxTokens: 8 })
      return { ok: true, message: `연결 확인 완료 (model: ${result.model})` }
    } catch (err: any) {
      return { ok: false, message: err.message }
    }
  }

  getAvailableModels(): string[] {
    return ['gpt-5.1', 'gpt-5.1-mini', 'gpt-4.1']
  }
}
