import { getAuthSecret } from '../worker/crypto/encryption'
import type { Bindings } from '../worker/env'

const bindingKeys = [
  'INITIAL_ADMIN_EMAIL', 'DISABLE_ADMIN_BOOTSTRAP', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'KMA_SERVICE_KEY', 'KMA_ALERT_SERVICE_KEY', 'AIRKOREA_SERVICE_KEY', 'AIRKOREA_STATION_SERVICE_KEY',
  'G2B_SERVICE_KEY', 'MATERIAL_PRICE_SERVICE_KEY', 'LAW_OC', 'LAW_API_KEY', 'ECOS_API_KEY',
  'NAVER_MAP_CLIENT_ID', 'NAVER_MAP_CLIENT_SECRET', 'NAVER_DYNAMIC_MAP_CLIENT_ID', 'ITS_API_KEY',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
] as const satisfies readonly (keyof Omit<Bindings, 'DB'>)[]

export function readConfig(env: Record<string, string | undefined>) {
  const secret = getAuthSecret(env)
  let baseUrl: URL
  try {
    baseUrl = new URL(env.APP_BASE_URL ?? '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)
    if ((baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && loopback)) ||
      baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) throw new Error()
  } catch {
    throw new Error('APP_BASE_URL must be an HTTPS origin, or HTTP on localhost/127.0.0.1/[::1]')
  }
  const port = env.PORT === undefined ? '3000' : env.PORT
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('PORT must be an integer between 1 and 65535')
  const databasePath = env.DATABASE_PATH ?? 'data/dashboard.sqlite'
  if (!databasePath.trim() || databasePath === ':memory:') throw new Error('DATABASE_PATH must point to a persistent SQLite file')
  const host = env.HOST ?? '0.0.0.0'
  if (!host.trim()) throw new Error('HOST must not be empty')
  const bindings: Omit<Bindings, 'DB'> = {
    ...Object.fromEntries(bindingKeys.map((key) => [key, env[key]])),
    AUTH_SECRET: secret,
    APP_BASE_URL: baseUrl.origin,
  }
  return { host, port: Number(port), databasePath, bindings }
}
