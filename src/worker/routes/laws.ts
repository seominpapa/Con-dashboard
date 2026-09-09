import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getLawProvider } from '../providers/laws'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'
import { LAW_SEARCH_MAX_LENGTH, LAW_SEARCH_MAX_RESULTS, LAW_SEARCH_MIN_LENGTH, LAW_SELECTION_MAX, RECOMMENDED_LAWS } from '../../shared/types/law'
import { SettingsRepository } from '../repositories/SettingsRepository'

const app = new Hono<AppEnv>()

app.get('/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  if (query.length < LAW_SEARCH_MIN_LENGTH || query.length > LAW_SEARCH_MAX_LENGTH) {
    return c.json(fail(`검색어는 ${LAW_SEARCH_MIN_LENGTH}~${LAW_SEARCH_MAX_LENGTH}자로 입력해 주세요`, 'live'), 400)
  }
  const user = c.get('currentUser')!
  if (!await new SettingsRepository(c.env.DB).consumeFixedWindow(`law_search_rate:${user.id}`, 30, 60)) {
    c.header('Retry-After', '60')
    return c.json(fail('법령 검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', 'live'), 429)
  }

  const limit = Math.min(LAW_SEARCH_MAX_RESULTS, Math.max(1, Number(c.req.query('limit') ?? 10) || 10))
  try {
    const provider = await getLawProvider(c.env)
    return c.json(ok(await provider.searchLaws(query, limit), provider.source))
  } catch (err: any) {
    return c.json(fail(`법령 검색에 실패했습니다: ${err.message}`, 'live'), 502)
  }
})

// GET /api/laws?names=법1,법2 (미지정 시 추천 목록 사용)
app.get('/', async (c) => {
  const user = c.get('currentUser')!
  if (!await new SettingsRepository(c.env.DB).consumeFixedWindow(`law_list_rate:${user.id}`, 10, 60)) {
    c.header('Retry-After', '60')
    return c.json(fail('법령 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', 'live'), 429)
  }
  const namesParam = c.req.query('names')
  const names = namesParam ? namesParam.split(',').map((name) => name.trim()).filter(Boolean) : [...RECOMMENDED_LAWS]
  if (!names.length || names.length > LAW_SELECTION_MAX || names.some((name) => name.length > 100)) {
    return c.json(fail(`법령은 1~${LAW_SELECTION_MAX}개까지 선택할 수 있습니다`, 'live'), 400)
  }

  const cacheKey = `laws:${names.join(',')}`
  try {
    const provider = await getLawProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.law, () => provider.getLaws(names))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    envelope.asOf = value.map((law) => law.lastAmendedDate).sort().at(-1)
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, asOf: stale.value.map((law: any) => law.lastAmendedDate).sort().at(-1), message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`법령 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
