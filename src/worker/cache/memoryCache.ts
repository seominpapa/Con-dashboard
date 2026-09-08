/**
 * Cloudflare Workers 인메모리 캐시 (isolate 생존 기간 동안 유지)
 *
 * Workers는 요청마다 새 인스턴스가 뜰 수 있으므로 완벽한 캐시는 아니지만,
 * 동일 isolate가 재사용되는 동안(warm) 반복 API 호출을 줄여준다.
 * 더 강력한 캐시가 필요하면 Cloudflare Cache API 또는 KV로 교체 가능하도록
 * 이 모듈 인터페이스만 그대로 유지하면 된다.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 500

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) return undefined
  return entry.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey !== undefined) store.delete(oldestKey)
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/** 캐시가 만료되었더라도(stale) 마지막 값을 확인할 때 사용 */
export function cacheGetStale<T>(key: string): { value: T; isStale: boolean } | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  return { value: entry.value as T, isStale: Date.now() > entry.expiresAt }
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ value: T; cached: boolean }> {
  const cached = cacheGet<T>(key)
  if (cached !== undefined) {
    return { value: cached, cached: true }
  }
  const pending = inFlight.get(key) as Promise<T> | undefined
  if (pending) return { value: await pending, cached: false }

  const request = fetcher()
  inFlight.set(key, request)
  try {
    const value = await request
    cacheSet(key, value, ttlMs)
    return { value, cached: false }
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key)
  }
}

/** TTL(ms) 상수 - 기획 21번 캐싱 전략 */
export const CACHE_TTL = {
  weather: 15 * 60 * 1000, // 10~30분 -> 15분
  weatherAlert: 7 * 60 * 1000, // 5~10분 -> 7분
  airQuality: 30 * 60 * 1000, // 30분
  bidding: 45 * 60 * 1000, // 30분~1시간 -> 45분
  news: 20 * 60 * 1000, // 15~30분 -> 20분
  law: 12 * 60 * 60 * 1000, // 6~24시간 -> 12시간
  exchange: 45 * 60 * 1000, // 30분~1시간 -> 45분
  oil: 60 * 60 * 1000, // 1시간
  material: 12 * 60 * 60 * 1000, // 6~24시간 -> 12시간
  addressSearch: 10 * 60 * 1000,
  traffic: 5 * 60 * 1000,
} as const
