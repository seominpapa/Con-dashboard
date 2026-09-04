/**
 * Mock 데이터용 결정론적 pseudo-random 유틸
 * 동일 seed(예: siteId + 날짜)에 대해 항상 같은 값을 반환하여
 * 새로고침해도 값이 매번 요동치지 않고, 날짜가 바뀌면 값도 바뀌도록 한다.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

export function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length]
}

export function range(rnd: () => number, min: number, max: number): number {
  return min + rnd() * (max - min)
}

export function todaySeed(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 시간 단위로 조금씩 변하는 seed (같은 날 안에서도 시간마다 다르게) */
export function hourSeed(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 10)}-${d.getUTCHours()}`
}
