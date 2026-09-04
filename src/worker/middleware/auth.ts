import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../env'
import { verifySessionValue, getSessionUserId, sessionCookieName, getAuthSecretFromEnv } from '../auth/session'
import { UserRepository } from '../repositories/UserRepository'
import type { User } from '../../shared/types/user'

/**
 * Server Middleware / Authorization 계층 (기획 31번)
 * "단순히 UI에서 숨기는 것이 아니라 Server Middleware / Authorization 계층에서도 차단한다"
 * 를 명시적으로 구현하는 핵심 모듈.
 */

declare module 'hono' {
  interface ContextVariableMap {
    currentUser: User | null
  }
}

/** 세션 쿠키를 읽어 현재 사용자를 context에 주입한다 (없어도 통과, 이후 미들웨어에서 판단) */
export async function attachUser(c: Context<AppEnv>, next: Next) {
  const cookieVal = getCookie(c, sessionCookieName())
  if (!cookieVal) {
    c.set('currentUser', null)
    return next()
  }
  const secret = getAuthSecretFromEnv(c.env)
  const sessionId = await verifySessionValue(cookieVal, secret)
  if (!sessionId) {
    c.set('currentUser', null)
    return next()
  }
  const userId = await getSessionUserId(c.env.DB, sessionId)
  if (!userId) {
    c.set('currentUser', null)
    return next()
  }
  const userRepo = new UserRepository(c.env.DB)
  const user = await userRepo.findById(userId)
  c.set('currentUser', user)
  return next()
}

/** 로그인 필수 (세션 존재) */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const user = c.get('currentUser')
  if (!user) {
    return c.json({ status: 'error', message: '로그인이 필요합니다', code: 'UNAUTHENTICATED' }, 401)
  }
  return next()
}

/** APPROVED 상태 필수 - Dashboard 및 내부 API 접근 차단의 핵심 게이트 */
export async function requireApproved(c: Context<AppEnv>, next: Next) {
  const user = c.get('currentUser')
  if (!user) {
    return c.json({ status: 'error', message: '로그인이 필요합니다', code: 'UNAUTHENTICATED' }, 401)
  }
  if (user.status === 'PENDING') {
    return c.json({ status: 'error', message: '관리자 승인 대기 중입니다', code: 'PENDING_APPROVAL' }, 403)
  }
  if (user.status === 'REJECTED') {
    return c.json({ status: 'error', message: '가입이 거절되었습니다', code: 'REJECTED' }, 403)
  }
  if (user.status === 'SUSPENDED') {
    return c.json({ status: 'error', message: '계정이 정지되었습니다', code: 'SUSPENDED' }, 403)
  }
  return next()
}

/** ADMIN Role 필수 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get('currentUser')
  if (!user) {
    return c.json({ status: 'error', message: '로그인이 필요합니다', code: 'UNAUTHENTICATED' }, 401)
  }
  if (user.role !== 'ADMIN') {
    return c.json({ status: 'error', message: '관리자 권한이 필요합니다', code: 'FORBIDDEN' }, 403)
  }
  if (user.status !== 'APPROVED') {
    return c.json({ status: 'error', message: '승인되지 않은 관리자 계정입니다', code: 'PENDING_APPROVAL' }, 403)
  }
  return next()
}
