import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { SiteRepository } from '../repositories/SiteRepository'
import { IntegrationRepository } from '../repositories/IntegrationRepository'
import { getAuthSecretFromEnv } from '../auth/session'
import { VWorldGeocodingProvider, type GeocodingResult } from '../providers/geocoding/VWorldGeocodingProvider'
import { ok, fail } from '../../shared/types/common'
import { latLonToKmaGrid } from '../../shared/utils/kmaGrid'

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
  if (!apiKey) throw new Error('주소 좌표 변환 API가 설정되지 않았습니다')
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
