export type TrafficStatus = '원활' | '서행' | '정체' | '정보없음'

export interface NearbyRoadTraffic {
  roadName: string
  speedKph: number
  travelTimeSeconds?: number
  direction?: string
  status: TrafficStatus
  statusSource?: 'speed'
}

export interface NearbyTrafficIncident {
  title: string
  roadName?: string
  type: string
  description?: string
  startedAt?: string
  endedAt?: string
}

export interface NearbyTrafficSnapshot {
  siteId: string
  roads: NearbyRoadTraffic[]
  incidents: NearbyTrafficIncident[]
  roadsAvailable: boolean
  incidentsAvailable: boolean
  observedAt: string
}

const TRAFFIC_STALE_MAX_AGE_MS = 30 * 60 * 1000

export function canUseStaleTraffic(snapshot: Pick<NearbyTrafficSnapshot, 'observedAt'>, now = Date.now()): boolean {
  const observedAt = Date.parse(snapshot.observedAt)
  const age = now - observedAt
  return Number.isFinite(observedAt) && age >= 0 && age <= TRAFFIC_STALE_MAX_AGE_MS
}
