import { SettingsRepository } from '../repositories/SettingsRepository.ts'
import { ok, type ApiEnvelope } from '../../shared/types/common.ts'

/** Live-only last-good snapshot: one stable key per user/widget, scoped to its query. */
export async function withWidgetSnapshot<T>(
  db: D1Database,
  key: string,
  scope: string,
  ttlMs: number,
  maxAgeMs: number,
  fetcher: () => Promise<T>,
  isUsable: (value: T) => boolean,
): Promise<ApiEnvelope<T>> {
  const repository = new SettingsRepository(db)
  let snapshot: { data: T; updatedAt: string } | undefined
  try {
    const stored = await repository.get(key)
    const value = stored ? JSON.parse(stored) : null
    const age = Date.now() - Date.parse(value?.updatedAt)
    if (value?.scope === scope && typeof value.updatedAt === 'string' && Number.isFinite(age)
      && age >= 0 && age <= maxAgeMs && isUsable(value.data)) snapshot = value
  } catch {
    console.warn('Widget snapshot read unavailable')
  }
  const restored = (stale: boolean): ApiEnvelope<T> => ({
    status: 'success', data: snapshot!.data, updatedAt: snapshot!.updatedAt,
    source: 'live', cached: true,
    ...(stale ? { stale: true, message: '갱신된 데이터를 받지 못해 마지막 정상 데이터를 표시합니다.' } : {}),
  })
  if (snapshot && Date.now() - Date.parse(snapshot.updatedAt) < ttlMs) return restored(false)

  let data: T
  try {
    data = await fetcher()
  } catch (error) {
    if (snapshot && Date.now() - Date.parse(snapshot.updatedAt) <= maxAgeMs && isUsable(snapshot.data)) return restored(true)
    throw error
  }
  if (!isUsable(data)) {
    if (snapshot && Date.now() - Date.parse(snapshot.updatedAt) <= maxAgeMs && isUsable(snapshot.data)) return restored(true)
    return ok(data, 'live')
  }
  const envelope = ok(data, 'live')
  try {
    await repository.set(key, JSON.stringify({ scope, data, updatedAt: envelope.updatedAt }))
  } catch {
    console.warn('Widget snapshot write unavailable')
  }
  return envelope
}
