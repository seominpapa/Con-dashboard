import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../../env'
import { buildGoogleAuthUrl, exchangeCodeForToken, fetchGoogleUserInfo } from '../../auth/googleOAuth'
import {
  GOOGLE_OAUTH_CANDIDATE_PROVIDER,
  GOOGLE_OAUTH_PROVIDER,
  getEnvironmentGoogleOAuthCredential,
  getStoredGoogleOAuthCredential,
  toGoogleOAuthBindings,
} from '../../auth/googleOAuthConfig'
import { validateGoogleOAuthCredential } from '../../auth/googleOAuthCredential'
import { generateId, getAuthSecretFromEnv } from '../../auth/session'
import { IntegrationRepository } from '../../repositories/IntegrationRepository'
import { fail, ok } from '../../../shared/types/common'

const app = new Hono<AppEnv>()
const STATE_COOKIE = 'cd_oauth_config_state'
const VERSION_COOKIE = 'cd_oauth_config_version'

function appOrigin(requestUrl: string, appBaseUrl?: string): string {
  return appBaseUrl ? new URL(appBaseUrl).origin : new URL(requestUrl).origin
}

function verificationCallbackUrl(requestUrl: string, appBaseUrl?: string): string {
  return `${appOrigin(requestUrl, appBaseUrl)}/api/admin/oauth/google/callback`
}

function loginCallbackUrl(requestUrl: string, appBaseUrl?: string): string {
  return `${appOrigin(requestUrl, appBaseUrl)}/api/auth/google/callback`
}

function setVerificationCookie(c: any, name: string, value: string) {
  setCookie(c, name, value, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600, path: '/' })
}

function clearVerificationCookies(c: any) {
  deleteCookie(c, STATE_COOKIE, { path: '/' })
  deleteCookie(c, VERSION_COOKIE, { path: '/' })
}

app.get('/', async (c) => {
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const [active, candidate] = await Promise.all([
    repo.getSummary(GOOGLE_OAUTH_PROVIDER),
    repo.getSummary(GOOGLE_OAUTH_CANDIDATE_PROVIDER),
  ])
  const environmentConfigured = Boolean(getEnvironmentGoogleOAuthCredential(c.env))
  const databaseConfigured = Boolean(active?.connectedAt && active.status !== 'DISCONNECTED')
  const forcedEnvironment = c.env.FORCE_ENV_GOOGLE_OAUTH === 'true'
  return c.json(ok({
    provider: 'google',
    status: forcedEnvironment
      ? environmentConfigured ? 'CONNECTED' : 'DISCONNECTED'
      : databaseConfigured || environmentConfigured ? 'CONNECTED' : 'DISCONNECTED',
    source: forcedEnvironment || !databaseConfigured ? environmentConfigured ? 'environment' : null : 'database',
    environmentConfigured,
    databaseConfigured,
    candidateConfigured: Boolean(candidate?.connectedAt && candidate.status !== 'DISCONNECTED'),
    forcedEnvironment,
    verificationCallbackUrl: verificationCallbackUrl(c.req.url, c.env.APP_BASE_URL),
    loginCallbackUrl: loginCallbackUrl(c.req.url, c.env.APP_BASE_URL),
  }, 'live'))
})

app.post('/google/candidate', async (c) => {
  const admin = c.get('currentUser')!
  const validation = validateGoogleOAuthCredential(await c.req.json().catch(() => null))
  if (!validation.valid) return c.json(fail(validation.message, 'live'), 400)
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await repo.upsertCredential({
    provider: GOOGLE_OAUTH_CANDIDATE_PROVIDER,
    type: 'auth_provider',
    credential: { ...validation.credential },
    updatedBy: admin.id,
  })
  return c.json(ok({ verificationCallbackUrl: verificationCallbackUrl(c.req.url, c.env.APP_BASE_URL) }, 'live'))
})

app.get('/google/verify', async (c) => {
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  const [candidate, summary] = await Promise.all([
    getStoredGoogleOAuthCredential(c.env, GOOGLE_OAUTH_CANDIDATE_PROVIDER),
    repo.getSummary(GOOGLE_OAUTH_CANDIDATE_PROVIDER),
  ])
  if (!candidate || !summary?.connectedAt) return c.json(fail('먼저 Google OAuth 설정을 저장해 주세요', 'live'), 400)

  const state = generateId('oauth-config')
  setVerificationCookie(c, STATE_COOKIE, state)
  setVerificationCookie(c, VERSION_COOKIE, summary.connectedAt)
  return c.redirect(buildGoogleAuthUrl(toGoogleOAuthBindings(candidate), verificationCallbackUrl(c.req.url, c.env.APP_BASE_URL), state))
})

app.get('/google/callback', async (c) => {
  const admin = c.get('currentUser')!
  const code = c.req.query('code')
  const state = c.req.query('state')
  const savedState = getCookie(c, STATE_COOKIE)
  const savedVersion = getCookie(c, VERSION_COOKIE)
  const returnTo = '/admin/oauth'
  if (!code || !state || state !== savedState || !savedVersion) {
    clearVerificationCookies(c)
    return c.redirect(`${returnTo}?error=invalid_state`)
  }

  try {
    const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
    const summary = await repo.getSummary(GOOGLE_OAUTH_CANDIDATE_PROVIDER)
    const candidate = await getStoredGoogleOAuthCredential(c.env, GOOGLE_OAUTH_CANDIDATE_PROVIDER)
    if (!candidate || summary?.connectedAt !== savedVersion) throw new Error('OAuth candidate changed')

    const bindings = toGoogleOAuthBindings(candidate)
    const token = await exchangeCodeForToken(bindings, code, verificationCallbackUrl(c.req.url, c.env.APP_BASE_URL))
    const profile = await fetchGoogleUserInfo(token.access_token)
    if (profile.email.toLowerCase() !== admin.email.toLowerCase()) throw new Error('OAuth account mismatch')

    await repo.upsertCredential({
      provider: GOOGLE_OAUTH_PROVIDER,
      type: 'auth_provider',
      credential: { ...candidate },
      updatedBy: admin.id,
    })
    await repo.recordCheckResult(GOOGLE_OAUTH_PROVIDER, true)
    await repo.disconnect(GOOGLE_OAUTH_CANDIDATE_PROVIDER, admin.id)
    clearVerificationCookies(c)
    return c.redirect(`${returnTo}?verified=1`)
  } catch {
    clearVerificationCookies(c)
    return c.redirect(`${returnTo}?error=verification_failed`)
  }
})

app.post('/google/disconnect', async (c) => {
  const admin = c.get('currentUser')!
  const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
  await Promise.all([
    repo.disconnect(GOOGLE_OAUTH_PROVIDER, admin.id),
    repo.disconnect(GOOGLE_OAUTH_CANDIDATE_PROVIDER, admin.id),
  ])
  return c.json(ok({ provider: 'google' }, 'live'))
})

export default app
