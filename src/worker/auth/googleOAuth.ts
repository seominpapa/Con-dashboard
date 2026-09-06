import type { Bindings } from '../env'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export interface GoogleUserInfo {
  sub: string
  email: string
  email_verified: boolean
  name: string
  picture?: string
}

export function parseGoogleUserInfo(value: unknown): GoogleUserInfo {
  if (!value || typeof value !== 'object') throw new Error('Invalid Google profile')
  const profile = value as Record<string, unknown>
  if (
    typeof profile.sub !== 'string' ||
    !profile.sub ||
    typeof profile.email !== 'string' ||
    !profile.email.includes('@') ||
    typeof profile.name !== 'string' ||
    !profile.name
  ) {
    throw new Error('Invalid Google profile')
  }
  if (profile.email_verified !== true) throw new Error('Google email is not verified')
  return {
    sub: profile.sub,
    email: profile.email,
    email_verified: true,
    name: profile.name,
    ...(typeof profile.picture === 'string' ? { picture: profile.picture } : {}),
  }
}

export function isGoogleOAuthConfigured(env: Bindings): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export function buildGoogleAuthUrl(env: Bindings, redirectUri: string, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export async function exchangeCodeForToken(
  env: Bindings,
  code: string,
  redirectUri: string
): Promise<{ access_token: string; id_token: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google 토큰 교환 실패: ${res.status} ${text}`)
  }
  return res.json()
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Google 사용자정보 조회 실패: ${res.status}`)
  return parseGoogleUserInfo(await res.json())
}
