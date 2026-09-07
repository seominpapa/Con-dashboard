import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { SiteRepository } from '../repositories/SiteRepository'
import { IntegrationRepository } from '../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../auth/session'
import { VWorldGeocodingProvider, type GeocodingResult } from '../providers/geocoding/VWorldGeocodingProvider'
import { ok, fail } from '../../shared/types/common'
import { latLonToKmaGrid } from '../../shared/utils/kmaGrid'
import { CACHE_TTL, withCache } from '../cache/memoryCache'
import { SettingsRepository } from '../repositories/SettingsRepository'

const app = new Hono<AppEnv>()
const MAX_ADDRESS_LENGTH = 200

type SiteInput = {
  name?: string
  company?: string
  address?: string
  startDate?: string
  endDate?: string
  status?: 'active' | 'planned' | 'completed' | 'suspended'
  airkoreaStationName?: string
}

type SitePatch = SiteInput & {
  latitude?: number
  longitude?: number
  kmaNx?: number
  kmaNy?: number
}

async function getVWorldApiKey(env: AppEnv['Bindings']): Promise<string | null> {
  const repo = new IntegrationRepository(env.DB, getAuthSecretFromEnv(env))
  const credential = await repo.getDecryptedCredential<{ apiKey: string }>('vworld').catch(() => null)
  return credential?.apiKey || env.VWORLD_API_KEY || null
}

async function geocodeSiteAddress(env: AppEnv['Bindings'], address: string): Promise<GeocodingResult> {
  const apiKey = await getVWorldApiKey(env)
  if (!apiKey) throw new Error('관리자 > API 연결 센터에서 VWorld API Key를 먼저 설정해 주세요')
  return new VWorldGeocodingProvider(apiKey).geocode(address)
}

const SITE_STATUSES = ['active', 'planned', 'completed', 'suspended'] as const

function safeSiteInput(input: unknown): SiteInput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const body = input as Record<string, unknown>
  if (body.status !== undefined && !SITE_STATUSES.includes(body.status as any)) return null
  const string = (key: string) => body[key] === undefined ? undefined : typeof body[key] === 'string' ? body[key].trim() : null
  const values = ['name', 'company', 'address', 'startDate', 'endDate', 'airkoreaStationName'].map(string)
  if (values.includes(null)) return null
  const [name, company, address, startDate, endDate, airkoreaStationName] = values as (string | undefined)[]
  if (address && address.length > MAX_ADDRESS_LENGTH) return null
  return {
    ...(name !== undefined && { name }),
    ...(company !== undefined && { company }),
    ...(address !== undefined && { address }),
    ...(startDate !== undefined && { startDate }),
    ...(endDate !== undefined && { endDate }),
    ...(body.status !== undefined && { status: body.status as SiteInput['status'] }),
    ...(airkoreaStationName !== undefined && { airkoreaStationName: airkoreaStationName || undefined }),
  }
}

app.get('/', async (c) => {
  const user = c.get('currentUser')!
  const repo = new SiteRepository(c.env.DB)
  const sites = await repo.listByUser(user.id)
  return c.json(ok(sites, 'live'))
})

app.get('/address-search', async (c) => {
  const user = c.get('currentUser')!
  const query = (c.req.query('q') ?? '').trim()
  if (query.length < 2) return c.json(ok([], 'live'))
  if (query.length > MAX_ADDRESS_LENGTH) return c.json(fail('검색어가 너무 깁니다', 'live'), 400)
  const apiKey = await getVWorldApiKey(c.env)
  if (!apiKey) return c.json(fail('관리자 > API 연결 센터에서 VWorld API Key를 먼저 설정해 주세요', 'live'), 503)
  if (!await new SettingsRepository(c.env.DB).consumeFixedWindow(`address_search_rate:${user.id}`, 30, 60)) {
    c.header('Retry-After', '60')
    return c.json(fail('주소 검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', 'live'), 429)
  }
  try {
    const cacheKey = `address-search:${query.toLocaleLowerCase('ko-KR')}`
    const { value, cached } = await withCache(cacheKey, CACHE_TTL.addressSearch, () => new VWorldGeocodingProvider(apiKey).search(query))
    return c.json({ ...ok(value, 'live'), cached })
  } catch {
    return c.json(fail('주소 검색 서비스가 응답하지 않습니다', 'live'), 502)
  }
})

app.post('/', async (c) => {
  const user = c.get('currentUser')!
  const body = safeSiteInput(await c.req.json().catch(() => null))
  if (!body?.name || !body.address) {
    return c.json(fail('현장명과 주소가 필요합니다', 'live'), 400)
  }

  let coords: GeocodingResult
  try {
    coords = await geocodeSiteAddress(c.env, body.address)
  } catch (err: any) {
    return c.json(fail(err.message || '주소로 좌표를 찾을 수 없습니다', 'live'), 400)
  }
  const { nx, ny } = latLonToKmaGrid(coords.latitude, coords.longitude)
  const repo = new SiteRepository(c.env.DB)
  const created = await repo.create(user.id, {
    name: body.name,
    company: body.company ?? '',
    address: body.address,
    latitude: coords.latitude,
    longitude: coords.longitude,
    kmaNx: nx,
    kmaNy: ny,
    startDate: body.startDate ?? '',
    endDate: body.endDate ?? '',
    status: body.status ?? 'active',
    airkoreaStationName: body.airkoreaStationName,
  })
  return c.json(ok(created, 'live'))
})

app.patch('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const body: SitePatch | null = safeSiteInput(await c.req.json().catch(() => null))
  if (!body || body.name === '' || body.address === '') {
    return c.json(fail('입력값을 확인해 주세요', 'live'), 400)
  }
  const repo = new SiteRepository(c.env.DB)
  const existing = await repo.findById(user.id, id)
  if (!existing) return c.json(fail('현장을 찾을 수 없습니다', 'live'), 404)
  if (body.address && body.address !== existing.address) {
    let coords: GeocodingResult
    try {
      coords = await geocodeSiteAddress(c.env, body.address)
    } catch (err: any) {
      return c.json(fail(err.message || '주소로 좌표를 찾을 수 없습니다', 'live'), 400)
    }
    const { nx, ny } = latLonToKmaGrid(coords.latitude, coords.longitude)
    body.latitude = coords.latitude
    body.longitude = coords.longitude
    body.kmaNx = nx
    body.kmaNy = ny
  }
  await repo.update(user.id, id, body)
  return c.json(ok({ id }, 'live'))
})

app.delete('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const repo = new SiteRepository(c.env.DB)
  await repo.delete(user.id, id)
  return c.json(ok({ id }, 'live'))
})

export default app
