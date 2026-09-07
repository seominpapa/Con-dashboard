import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { SettingsRepository, SETTINGS_KEY } from '../../repositories/SettingsRepository'
import { getAuthSecretFromEnv } from '../../auth/session'
import { getCredentialAdapter } from '../../llm/CredentialAdapter'
import { createLLMProvider, getLLMProvider, type LLMProviderKey } from '../../llm'
import { AI_PROVIDERS } from '../../../shared/types/integration'
import { ok, fail } from '../../../shared/types/common'
import { OPENAI_MODELS } from '../../../shared/types/integration'

const app = new Hono<AppEnv>()

// GET /api/admin/integrations/ai - Claude/Codex 연결 상태 + 기본 Provider
app.get('/', async (c) => {
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const settingsRepo = new SettingsRepository(c.env.DB)
  const summaries = await repo.listSummaries()
  const byProvider = new Map(summaries.map((s) => [s.provider, s]))
  const defaultProvider = await settingsRepo.get(SETTINGS_KEY.DEFAULT_LLM_PROVIDER)

  const result = AI_PROVIDERS.map((p) => {
    const summary = byProvider.get(p.key)
    const envFallback = p.key === 'claude' ? Boolean((c.env as any).ANTHROPIC_API_KEY) : Boolean((c.env as any).OPENAI_API_KEY)
    return {
      provider: p.key,
      label: p.label,
      status: summary?.status ?? (envFallback ? 'CONNECTED' : 'DISCONNECTED'),
      connectedAt: summary?.connectedAt ?? null,
      lastCheckedAt: summary?.lastCheckedAt ?? null,
      lastSuccessAt: summary?.lastSuccessAt ?? null,
      lastError: summary?.lastError ?? null,
      envFallbackAvailable: envFallback,
      dbConfigured: Boolean(summary?.connectedAt),
      model: p.key === 'codex' && typeof summary?.metadata?.model === 'string' ? summary.metadata.model : p.key === 'codex' ? OPENAI_MODELS[0] : null,
    }
  })

  return c.json(ok({ providers: result, defaultProvider: defaultProvider ?? null }, 'live'))
})

// POST /api/admin/integrations/ai/:provider/connect  body: { apiKey: '...' }
app.post('/:provider/connect', async (c) => {
  const admin = c.get('currentUser')!
  const providerKey = c.req.param('provider') as LLMProviderKey
  if (providerKey !== 'claude' && providerKey !== 'codex') return c.json(fail('알 수 없는 provider', 'live'), 400)

  const body = await c.req.json().catch(() => ({}))
  const adapter = getCredentialAdapter(providerKey)
  const validation = adapter.validate(body)
  if (!validation.valid) return c.json(fail(validation.message ?? '입력값이 올바르지 않습니다', 'live'), 400)
  const normalized = adapter.normalize(body)

  const provider = createLLMProvider(providerKey, normalized.apiKey, normalized.model)
  const health = await provider.healthCheck()
  if (!health.ok) return c.json(fail(health.message ?? 'LLM Provider 연결에 실패했습니다', 'live'), 400)

  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.upsertCredential({
    provider: providerKey,
    type: 'ai_provider',
    credential: normalized,
    metadata: providerKey === 'codex' ? { model: normalized.model } : undefined,
    updatedBy: admin.id,
  })
  await repo.recordCheckResult(providerKey, true)
  return c.json(ok({ provider: providerKey, health }, 'live'))
})

// POST /api/admin/integrations/ai/:provider/test
app.post('/:provider/test', async (c) => {
  const providerKey = c.req.param('provider') as LLMProviderKey
  if (providerKey !== 'claude' && providerKey !== 'codex') return c.json(fail('알 수 없는 provider', 'live'), 400)

  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const provider = await getLLMProvider(c.env, providerKey)
  const health = provider ? await provider.healthCheck() : { ok: false, message: 'Provider가 연결되어 있지 않습니다' }
  await repo.ensureRow(providerKey, 'ai_provider')
  await repo.recordCheckResult(providerKey, health.ok, health.ok ? undefined : health.message)
  return c.json(ok({ provider: providerKey, health }, 'live'))
})

// POST /api/admin/integrations/ai/:provider/disconnect
app.post('/:provider/disconnect', async (c) => {
  const admin = c.get('currentUser')!
  const providerKey = c.req.param('provider') as LLMProviderKey
  if (providerKey !== 'claude' && providerKey !== 'codex') return c.json(fail('알 수 없는 provider', 'live'), 400)
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.disconnect(providerKey, admin.id)
  const settingsRepo = new SettingsRepository(c.env.DB)
  if ((await settingsRepo.get(SETTINGS_KEY.DEFAULT_LLM_PROVIDER)) === providerKey) {
    await settingsRepo.delete(SETTINGS_KEY.DEFAULT_LLM_PROVIDER)
  }
  return c.json(ok({ provider: providerKey }, 'live'))
})

// PUT /api/admin/integrations/ai/default  body: { provider: 'claude'|'codex' }
app.put('/default', async (c) => {
  const { provider } = await c.req.json()
  if (provider !== 'claude' && provider !== 'codex') return c.json(fail('알 수 없는 provider', 'live'), 400)
  if (!(await getLLMProvider(c.env, provider))) return c.json(fail('먼저 Provider를 연결해 주세요', 'live'), 400)
  const settingsRepo = new SettingsRepository(c.env.DB)
  await settingsRepo.set(SETTINGS_KEY.DEFAULT_LLM_PROVIDER, provider)
  return c.json(ok({ defaultProvider: provider }, 'live'))
})

export default app
