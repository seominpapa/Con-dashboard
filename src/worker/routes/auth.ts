import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { AppEnv } from '../env'
import {
  isGoogleOAuthConfigured,
  buildGoogleAuthUrl,
  exchangeCodeForToken,
  fetchGoogleUserInfo,
} from '../auth/googleOAuth'
import { UserRepository } from '../repositories/UserRepository'
import { createSession, deleteSession, signSessionValue, verifySessionValue, generateId, sessionCookieName, getAuthSecretFromEnv } from '../auth/session'
import { toPublicUser } from '../../shared/types/user'
import { fail } from '../../shared/types/common'

const app = new Hono<AppEnv>()

const STATE_COOKIE = 'cd_oauth_state'

function isAuthConfigured(env: AppEnv['Bindings']): boolean {
  if (!isGoogleOAuthConfigured(env)) return false
  try {
    getAuthSecretFromEnv(env)
    return true
  } catch {
    return false
  }
}

function getRedirectUri(c: any, env: any): string {
  const origin = env.APP_BASE_URL ? new URL(env.APP_BASE_URL).origin : new URL(c.req.url).origin
  return `${origin}/api/auth/google/callback`
}

// GET /api/auth/google - OAuth 시작
app.get('/google', async (c) => {
  if (!isAuthConfigured(c.env)) {
    return c.json(fail('Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.', 'unconfigured' as any), 503)
  }
  const state = generateId('state')
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 600,
    path: '/',
  })
  const redirectUri = getRedirectUri(c, c.env)
  const url = buildGoogleAuthUrl(c.env, redirectUri, state)
  return c.redirect(url)
})

// GET /api/auth/google/callback
app.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const savedState = getCookie(c, STATE_COOKIE)

  if (!code || !state || !savedState || state !== savedState) {
    return c.redirect('/login?error=invalid_state')
  }
  if (!isAuthConfigured(c.env)) {
    return c.redirect('/login?error=not_configured')
  }

  try {
    const redirectUri = getRedirectUri(c, c.env)
    const tokenRes = await exchangeCodeForToken(c.env, code, redirectUri)
    const profile = await fetchGoogleUserInfo(tokenRes.access_token)

    const userRepo = new UserRepository(c.env.DB)
    let user = await userRepo.findByGoogleId(profile.sub)

    if (!user) {
      // 이메일 중복 체크 (다른 방식 가입 방지용, 현재는 Google만 지원하므로 googleId 우선)
      const byEmail = await userRepo.findByEmail(profile.email)
      if (byEmail) {
        throw new Error('Google 계정 식별자가 기존 사용자와 일치하지 않습니다')
      } else {
        const isBootstrapAdmin =
          c.env.DISABLE_ADMIN_BOOTSTRAP !== 'true' &&
          c.env.INITIAL_ADMIN_EMAIL &&
          c.env.INITIAL_ADMIN_EMAIL.toLowerCase() === profile.email.toLowerCase()

        // Bootstrap 조건이어도 이미 ADMIN이 존재하면 안전하게 일반 가입으로 처리
        const adminExists = (await userRepo.countAdmins()) > 0
        const grantBootstrap = isBootstrapAdmin && !adminExists

        user = await userRepo.create({
          email: profile.email,
          name: profile.name,
          profileImage: profile.picture ?? null,
          googleId: profile.sub,
          role: grantBootstrap ? 'ADMIN' : 'USER',
          status: grantBootstrap ? 'APPROVED' : 'PENDING',
        })
      }
    } else {
      await userRepo.updateLastLogin(user.id)
    }

    const sessionId = await createSession(c.env.DB, user.id)
    const signed = await signSessionValue(sessionId, getAuthSecretFromEnv(c.env))
    setCookie(c, sessionCookieName(), signed, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
    deleteCookie(c, STATE_COOKIE, { path: '/' })

    return c.redirect('/')
  } catch (err: any) {
    console.error('[auth] Google OAuth callback error:', err.message)
    return c.redirect('/login?error=oauth_failed')
  }
})

// GET /api/auth/me - 현재 로그인 사용자 정보
app.get('/me', async (c) => {
  const user = c.get('currentUser')
  if (!user) {
    return c.json({ status: 'success', data: null })
  }
  return c.json({ status: 'success', data: toPublicUser(user) })
})

// POST /api/auth/logout
app.post('/logout', async (c) => {
  const cookieVal = getCookie(c, sessionCookieName())
  if (cookieVal) {
    const secret = getAuthSecretFromEnv(c.env)
    const sessionId = await verifySessionValue(cookieVal, secret)
    if (sessionId) await deleteSession(c.env.DB, sessionId)
  }
  deleteCookie(c, sessionCookieName(), { path: '/' })
  return c.json({ status: 'success' })
})

// GET /api/auth/config - 클라이언트가 Google 로그인 버튼 노출 여부 판단용 (Key 노출 없음)
app.get('/config', async (c) => {
  return c.json({ status: 'success', data: { googleEnabled: isAuthConfigured(c.env) } })
})

export default app
