import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getExchangeRateProvider } from '../providers/exchange'
import { withCache, CACHE_TTL, cacheGetStale } from '../cache/memoryCache'
import { ok, fail } from '../../shared/types/common'

const app = new Hono<AppEnv>()

// GET /api/exchange-rates?codes=USD,EUR,JPY,CNY
app.get('/', async (c) => {
  const codesParam = c.req.query('codes')
  const codes = codesParam ? codesParam.split(',') : ['USD', 'EUR', 'JPY', 'CNY']

  const cacheKey = `exchange:${codes.join(',')}`
  try {
    const provider = await getExchangeRateProvider(c.env)
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.exchange, () => provider.getRates(codes))
    const envelope = ok(value, provider.source)
    envelope.cached = cached
    envelope.asOf = value.map((item) => item.asOf ?? '').sort().at(-1) || undefined
    return c.json(envelope)
  } catch (err: any) {
    const stale = cacheGetStale<any>(cacheKey)
    if (stale) {
      return c.json({ status: 'success', data: stale.value, updatedAt: new Date().toISOString(), source: 'live', cached: true, message: `이전 데이터를 표시합니다 (갱신 실패: ${err.message})` })
    }
    return c.json(fail(`환율 정보를 불러올 수 없습니다: ${err.message}`, 'live'), 502)
  }
})

export default app
