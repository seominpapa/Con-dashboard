import type { Site } from '../../../shared/types/site'
import type {
  NearbyRoadTraffic,
  NearbyTrafficIncident,
  NearbyTrafficSnapshot,
  TrafficStatus,
} from '../../../shared/types/traffic'

const BASE_URL = 'https://openapi.its.go.kr:9443'
const BOUNDS_DEGREES = 0.03
const MAX_ROADS = 8
const MAX_INCIDENTS = 5
const MAX_INPUT_ITEMS = 1000
const MAX_RESPONSE_BYTES = 2_000_000
const REQUEST_TIMEOUT_MS = 10_000
const EVENT_TYPE_LABEL: Record<string, string> = {
  cor: '공사',
  acc: '교통사고',
  wea: '기상',
  ete: '기타돌발',
  dis: '재난',
  etc: '기타',
}

function itemsFrom(json: any): any[] {
  const items = json?.body?.data ?? json?.body?.items ?? json?.response?.body?.items ?? []
  if (Array.isArray(items)) return items
  if (Array.isArray(items?.item)) return items.item
  return items?.item ? [items.item] : []
}

function clean(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function number(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function status(value: unknown): TrafficStatus {
  const normalized = clean(value, 10)
  return normalized === '원활' || normalized === '서행' || normalized === '정체' ? normalized : '정보없음'
}

function normalizeRoad(item: any): NearbyRoadTraffic | null {
  const roadName = clean(item?.roadName)
  const speedKph = number(item?.speed)
  if (!roadName || speedKph === undefined) return null
  const travelTimeSeconds = number(item?.travelTime)
  const direction = clean(item?.direction ?? item?.roadDrcType ?? item?.drcType, 80)
  return {
    roadName,
    speedKph,
    ...(travelTimeSeconds === undefined ? {} : { travelTimeSeconds }),
    ...(direction ? { direction } : {}),
    status: status(item?.status ?? item?.trafficStatus),
  }
}

function normalizeIncident(item: any): NearbyTrafficIncident | null {
  const eventType = clean(item?.eventType ?? item?.incidentType ?? item?.type, 80)
  const type = (eventType && EVENT_TYPE_LABEL[eventType.toLowerCase()]) ?? eventType ?? '도로 돌발'
  const roadName = clean(item?.roadName ?? item?.location, 120)
  const description = clean(item?.description ?? item?.message ?? item?.eventDetailType, 300)
  const title = clean(item?.title ?? item?.eventName, 160) ?? description ?? `${type}${roadName ? ` · ${roadName}` : ''}`
  if (!title) return null
  const startedAt = clean(item?.startDate ?? item?.startedAt, 40)
  const endedAt = clean(item?.endDate ?? item?.endedAt, 40)
  return {
    title,
    type,
    ...(roadName ? { roadName } : {}),
    ...(description ? { description } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
  }
}

async function readJson(response: Response): Promise<any> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('ITS 응답이 너무 큽니다')
  if (!response.body) return null

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('ITS 응답이 너무 큽니다')
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return JSON.parse(text)
}

function uniqueRoads(items: any[]): NearbyRoadTraffic[] {
  const byRoad = new Map<string, NearbyRoadTraffic>()
  for (const item of items.slice(0, MAX_INPUT_ITEMS)) {
    const road = normalizeRoad(item)
    if (!road) continue
    const key = `${road.roadName}|${road.direction ?? ''}`
    const existing = byRoad.get(key)
    if (!existing || road.speedKph < existing.speedKph) byRoad.set(key, road)
  }
  return [...byRoad.values()].slice(0, MAX_ROADS)
}

async function fetchFeed(path: 'trafficInfo' | 'eventInfo', apiKey: string, site: Pick<Site, 'latitude' | 'longitude'>): Promise<any[]> {
  const url = new URL(`${BASE_URL}/${path}`)
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('type', 'all')
  if (path === 'eventInfo') url.searchParams.set('eventType', 'all')
  url.searchParams.set('minX', (site.longitude - BOUNDS_DEGREES).toFixed(6))
  url.searchParams.set('maxX', (site.longitude + BOUNDS_DEGREES).toFixed(6))
  url.searchParams.set('minY', (site.latitude - BOUNDS_DEGREES).toFixed(6))
  url.searchParams.set('maxY', (site.latitude + BOUNDS_DEGREES).toFixed(6))
  url.searchParams.set('getType', 'json')

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const json: any = await readJson(response).catch(() => null)
  if (!response.ok) throw new Error(`ITS ${path} HTTP ${response.status}`)
  const resultCode = json?.header?.resultCode ?? json?.response?.header?.resultCode
  if (resultCode !== undefined && String(resultCode) !== '0') throw new Error(`ITS ${path} API 요청 실패`)
  if (!json) throw new Error(`ITS ${path} 응답 형식 오류`)
  return itemsFrom(json)
}

export class ItsTrafficProvider {
  readonly source = 'live' as const
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getNearbyTraffic(site: Pick<Site, 'id' | 'latitude' | 'longitude'>): Promise<NearbyTrafficSnapshot> {
    if (!this.apiKey.trim()) throw new Error('ITS API 키가 설정되지 않았습니다')
    if (!Number.isFinite(site.latitude) || site.latitude < -90 || site.latitude > 90 || !Number.isFinite(site.longitude) || site.longitude < -180 || site.longitude > 180) {
      throw new Error('현장 좌표가 올바르지 않습니다')
    }

    const [roadResult, incidentResult] = await Promise.allSettled([
      fetchFeed('trafficInfo', this.apiKey.trim(), site),
      fetchFeed('eventInfo', this.apiKey.trim(), site),
    ])
    if (roadResult.status === 'rejected' && incidentResult.status === 'rejected') {
      throw new Error('ITS 교통정보 API에 연결할 수 없습니다')
    }

    const roads = roadResult.status === 'fulfilled'
      ? uniqueRoads(roadResult.value)
      : []
    const incidents = incidentResult.status === 'fulfilled'
      ? incidentResult.value.slice(0, MAX_INPUT_ITEMS).map(normalizeIncident).filter((item): item is NearbyTrafficIncident => item !== null).slice(0, MAX_INCIDENTS)
      : []

    return {
      siteId: site.id,
      roads,
      incidents,
      roadsAvailable: roadResult.status === 'fulfilled',
      incidentsAvailable: incidentResult.status === 'fulfilled',
      observedAt: new Date().toISOString(),
    }
  }
}
