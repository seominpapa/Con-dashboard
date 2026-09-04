import { getAuthSecret } from '../crypto/encryption'
import type { Bindings } from '../env'

const SESSION_COOKIE = 'cd_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일

async function hmacSign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** sessionId.signature 형태의 서명된 쿠키 값 생성 */
export async function signSessionValue(sessionId: string, secret: string): Promise<string> {
  const sig = await hmacSign(sessionId, secret)
  return `${sessionId}.${sig}`
}

export async function verifySessionValue(value: string, secret: string): Promise<string | null> {
  const [sessionId, sig] = value.split('.')
  if (!sessionId || !sig) return null
  const expected = await hmacSign(sessionId, secret)
  if (expected !== sig) return null
  return sessionId
}

export function generateId(prefix = ''): string {
  const rand = crypto.randomUUID()
  return prefix ? `${prefix}_${rand}` : rand
}

export interface SessionRow {
  id: string
  user_id: string
  expires_at: string
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const id = generateId('sess')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(id, userId, expiresAt).run()
  return id
}

export async function getSessionUserId(db: D1Database, sessionId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ user_id: string; expires_at: string }>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
    return null
  }
  return row.user_id
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
}

export function sessionCookieName(): string {
  return SESSION_COOKIE
}

export function buildSessionCookieHeader(signedValue: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${signedValue}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  return parts.join('; ')
}

export function buildClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export function getAuthSecretFromEnv(env: Bindings): string {
  return getAuthSecret(env)
}
