import test from 'node:test'
import assert from 'node:assert/strict'

import { publicProviderFailureMessage, validatePublicCredential } from '../src/worker/integrations/publicCredentials.ts'
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

test('public API credentials require exactly the provider fields', () => {
  assert.deepEqual(validatePublicCredential('kma', { apiKey: '  key-123  ' }), {
    valid: true,
    credential: { apiKey: 'key-123' },
  })
  assert.deepEqual(validatePublicCredential('naver', { clientId: 'id', clientSecret: 'secret' }), {
    valid: true,
    credential: { clientId: 'id', clientSecret: 'secret' },
  })
  assert.equal(validatePublicCredential('naver', { clientId: 'id' }).valid, false)
  assert.equal(validatePublicCredential('law', { apiKey: '   ' }).valid, false)
  assert.equal(validatePublicCredential('kma', { apiKey: 'key', extra: 'unexpected' }).valid, false)
  assert.equal(validatePublicCredential('kma', 'key').valid, false)
})

test('public provider failures do not expose upstream response details', () => {
  assert.equal(publicProviderFailureMessage('kma'), '기상청 API 연결 확인에 실패했습니다')
  assert.equal(publicProviderFailureMessage('naver'), '네이버 뉴스 API 연결 확인에 실패했습니다')
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
  const env = { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' }
  assert.equal(isGoogleOAuthConfigured(env), true)
  assert.equal(isGoogleOAuthConfigured({}), false)

  const authorizationUrl = new URL(buildGoogleAuthUrl(env, 'https://dashboard.example.com/callback', 'state-1'))
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'client-id')
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://dashboard.example.com/callback')
  assert.equal(authorizationUrl.searchParams.get('state'), 'state-1')

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
})
