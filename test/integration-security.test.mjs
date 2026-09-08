import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeDataGoKrServiceKey, publicProviderFailureMessage, validatePublicCredential } from '../src/worker/integrations/publicCredentials.ts'
import { isSameOriginMutation } from '../src/worker/security/origin.ts'
import { decryptCredential, encryptCredential, getAuthSecret } from '../src/worker/crypto/encryption.ts'
import {
  buildGoogleAuthUrl,
  exchangeCodeForToken,
  fetchGoogleUserInfo,
  isGoogleOAuthConfigured,
  parseGoogleUserInfo,
} from '../src/worker/auth/googleOAuth.ts'
import { formatProviderHttpError } from '../src/worker/llm/LLMProvider.ts'
import { getCredentialAdapter, selectLLMCredential } from '../src/worker/llm/CredentialAdapter.ts'
import { CodexProvider } from '../src/worker/llm/CodexProvider.ts'

test('public API credentials require exactly the provider fields', () => {
  assert.deepEqual(validatePublicCredential('kma', { apiKey: '  key-123  ' }), {
    valid: true,
    credential: { apiKey: 'key-123' },
  })
  assert.deepEqual(validatePublicCredential('law', { oc: '  law-user-id  ' }), {
    valid: true,
    credential: { oc: 'law-user-id' },
  })
  assert.equal(validatePublicCredential('law', Object.fromEntries([['apiKey', 'legacy-field']])).valid, false)
  assert.equal(validatePublicCredential('law', { oc: '   ' }).valid, false)
  assert.equal(validatePublicCredential('kma', { apiKey: 'key', extra: 'unexpected' }).valid, false)
  assert.equal(validatePublicCredential('kma', 'key').valid, false)
})

test('data.go.kr encoded and decoded service keys are both accepted', () => {
  assert.equal(normalizeDataGoKrServiceKey('abc%2Bdef%2Fghi%3D'), 'abc+def/ghi=')
  assert.equal(normalizeDataGoKrServiceKey('abc+def/ghi='), 'abc+def/ghi=')
  assert.equal(normalizeDataGoKrServiceKey('abc%not-encoded'), 'abc%not-encoded')
})

test('public provider failures do not expose upstream response details', () => {
  assert.match(publicProviderFailureMessage('kma'), /^기상청 API 연결 확인에 실패했습니다/)
  assert.match(publicProviderFailureMessage('law'), /OC와 공동활용 신청 승인 상태/)
})

test('cookie-authenticated mutations require the same origin', () => {
  const url = 'https://dashboard.example.com/api/admin/integrations/law/connect'
  assert.equal(isSameOriginMutation(url, 'https://dashboard.example.com', null), true)
  assert.equal(isSameOriginMutation(url, null, 'https://dashboard.example.com/admin'), true)
  assert.equal(isSameOriginMutation(url, 'https://evil.example.com', null), false)
  assert.equal(isSameOriginMutation(url, null, null), false)
  assert.equal(isSameOriginMutation(url, 'not-a-url', null), false)
})

test('production secrets fail closed instead of using a public default', () => {
  assert.throws(() => getAuthSecret({}), /AUTH_SECRET/)
  assert.throws(() => getAuthSecret({ AUTH_SECRET: 'short' }), /AUTH_SECRET/)
  assert.equal(getAuthSecret({ AUTH_SECRET: 'a'.repeat(32) }), 'a'.repeat(32))
})

test('stored provider credentials are encrypted and authenticated', async () => {
  const secret = 's'.repeat(32)
  const encrypted = await encryptCredential('{"apiKey":"secret"}', secret)
  assert.equal(encrypted.includes('secret'), false)
  assert.equal(await decryptCredential(encrypted, secret), '{"apiKey":"secret"}')
  await assert.rejects(() => decryptCredential(encrypted, 'x'.repeat(32)))
})

test('Google OAuth accepts only a verified, well-formed profile', () => {
  assert.deepEqual(
    parseGoogleUserInfo({ sub: 'google-1', email: 'admin@example.com', email_verified: true, name: 'Admin' }),
    { sub: 'google-1', email: 'admin@example.com', email_verified: true, name: 'Admin' },
  )
  assert.throws(
    () => parseGoogleUserInfo({ sub: 'google-1', email: 'admin@example.com', email_verified: false, name: 'Admin' }),
    /verified/,
  )
  assert.throws(() => parseGoogleUserInfo({ email_verified: true }), /profile/)
})

test('Google OAuth uses the configured callback and validates remote responses', async () => {
  const env = { GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'client-secret' }
  assert.equal(isGoogleOAuthConfigured(env), true)
  assert.equal(isGoogleOAuthConfigured({}), false)
  assert.equal(isGoogleOAuthConfigured({ GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 'client-secret' }), false)
  assert.equal(isGoogleOAuthConfigured({ GOOGLE_CLIENT_ID: 'not-a-google-client', GOOGLE_CLIENT_SECRET: 'client-secret' }), false)
  assert.equal(isGoogleOAuthConfigured({ GOOGLE_CLIENT_ID: `${'x'.repeat(4096)}.apps.googleusercontent.com`, GOOGLE_CLIENT_SECRET: 'client-secret' }), false)

  const authorizationUrl = new URL(buildGoogleAuthUrl(env, 'https://dashboard.example.com/callback', 'state-1'))
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'client-id.apps.googleusercontent.com')
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://dashboard.example.com/callback')
  assert.equal(authorizationUrl.searchParams.get('state'), 'state-1')
  const trimmedUrl = new URL(buildGoogleAuthUrl({ GOOGLE_CLIENT_ID: ' client-id.apps.googleusercontent.com ', GOOGLE_CLIENT_SECRET: ' client-secret ' }, 'https://dashboard.example.com/callback', 'state-2'))
  assert.equal(trimmedUrl.searchParams.get('client_id'), 'client-id.apps.googleusercontent.com')

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/token')) {
      return new Response(JSON.stringify({ access_token: 'access', id_token: 'id' }), { status: 200 })
    }
    return new Response(
      JSON.stringify({ sub: 'google-1', email: 'admin@example.com', email_verified: true, name: 'Admin' }),
      { status: 200 },
    )
  }
  try {
    assert.deepEqual(await exchangeCodeForToken(env, 'code', 'https://dashboard.example.com/callback'), {
      access_token: 'access',
      id_token: 'id',
    })
    assert.equal((await fetchGoogleUserInfo('access')).email, 'admin@example.com')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('LLM errors exposed to admins do not persist upstream response bodies', () => {
  assert.equal(formatProviderHttpError('Claude', 401), 'Claude 인증에 실패했습니다')
  assert.equal(formatProviderHttpError('OpenAI', 429), 'OpenAI 요청 한도를 초과했습니다')
  assert.equal(formatProviderHttpError('OpenAI', 503), 'OpenAI 서비스가 일시적으로 응답하지 않습니다')
  assert.equal(formatProviderHttpError('OpenAI', 400), 'OpenAI 요청에 실패했습니다 (400)')
})

test('OpenAI health check uses a GPT-5.1 compatible request', async () => {
  const originalFetch = globalThis.fetch
  let requests = []
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    requests = [...requests, body]
    const incompatible =
      body.max_completion_tokens < 32 ||
      ((body.model === 'gpt-5.1' || body.model.startsWith('gpt-5.6')) && body.reasoning_effort !== 'none') ||
      (body.model === 'gpt-5-mini' && ('reasoning_effort' in body || 'temperature' in body)) ||
      (body.model === 'gpt-4.1' && 'reasoning_effort' in body)
    if (incompatible) {
      return new Response(JSON.stringify({ error: { code: 'invalid_request_error', param: 'max_completion_tokens' } }), { status: 400 })
    }
    return new Response(JSON.stringify({
      model: 'gpt-5.1',
      choices: [{ message: { content: 'pong' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }))
  }
  try {
    const provider = new CodexProvider('test-key')
    assert.deepEqual(await provider.healthCheck(), {
      ok: true,
      message: '연결 확인 완료 (model: gpt-5.1)',
    })
    await provider.generateBriefing('system', 'user', { jsonMode: true })
    await provider.chat([{ role: 'user', content: 'hello' }])
    assert.deepEqual(provider.getAvailableModels(), ['gpt-5.1', 'gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5-mini', 'gpt-4.1'])
    assert.equal(requests[1].messages[0].role, 'developer')
    assert.deepEqual(requests[1].response_format, { type: 'json_object' })
    assert.equal((await new CodexProvider('test-key', 'gpt-5-mini').healthCheck()).ok, true)
    assert.equal((await new CodexProvider('test-key', 'gpt-4.1').healthCheck()).ok, true)
    assert.equal((await new CodexProvider('test-key', 'gpt-5.6').healthCheck()).ok, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OpenAI structured errors are useful without exposing upstream messages', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'insufficient_quota', message: 'sensitive upstream account detail' },
  }), { status: 429 })
  try {
    const health = await new CodexProvider('test-key').healthCheck()
    assert.equal(health.ok, false)
    assert.equal(health.message, 'OpenAI 크레딧 또는 프로젝트 사용 한도를 확인해 주세요')
    assert.doesNotMatch(health.message, /sensitive|account detail/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a corrupted stored LLM credential cannot be masked by an environment fallback', () => {
  assert.equal(selectLLMCredential(true, null, 'valid-environment-key'), null)
  assert.equal(selectLLMCredential(false, null, 'valid-environment-key'), 'valid-environment-key')
})

test('LLM credential input rejects malformed or oversized values', () => {
  const adapter = getCredentialAdapter('claude')
  const validInput = Object.fromEntries([['apiKey', 'x'.repeat(12)]])
  assert.equal(adapter.validate(null).valid, false)
  assert.equal(adapter.validate({ apiKey: 'short' }).valid, false)
  assert.equal(adapter.validate({ apiKey: 'x'.repeat(4097) }).valid, false)
  assert.equal(adapter.validate(validInput).valid, true)

  const openai = getCredentialAdapter('codex')
  assert.equal(openai.validate({ apiKey: 'x'.repeat(12), model: 'unknown-model' }).valid, false)
  assert.equal(openai.validate({ apiKey: 'x'.repeat(12), model: 'gpt-5.6' }).valid, true)
  assert.deepEqual(openai.normalize({ apiKey: ` ${'x'.repeat(12)} `, model: 'gpt-5-mini' }), {
    apiKey: 'x'.repeat(12),
    model: 'gpt-5-mini',
  })
})
