import type { AirQualityProvider } from './AirQualityProvider'
import type { Site } from '../../../shared/types/site'
import type { AirQualityNow, AirQualityGrade } from '../../../shared/types/air-quality'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials.ts'

const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc'
const STATION_URL = 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList'
const MAX_STATIONS = 5

const SIDO_NAME: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
}

function gradeFromCai(grade: string): AirQualityGrade {
  switch (grade) {
    case '1':
      return 'good'
    case '2':
      return 'moderate'
    case '3':
      return 'bad'
    default:
      return 'very-bad'
  }
}

function measurement(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (value === null || value === undefined || (typeof value === 'string' && (!value.trim() || value.trim() === '-'))) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function measurementTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match) return undefined
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText ?? '0'].map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && hour <= 23 && minute <= 59 && second <= 59 ? trimmed : undefined
}

function observation(item: any) {
  const measuredAt = measurementTime(item?.dataTime)
  const pm10 = measurement(item?.pm10Value)
  const pm25 = measurement(item?.pm25Value)
  const o3 = measurement(item?.o3Value)
  const chai = measurement(item?.khaiValue)
  return measuredAt && pm10 !== undefined && pm25 !== undefined && o3 !== undefined && chai !== undefined
    ? { item, measuredAt, pm10, pm25, o3, chai }
    : null
}

function matchesArea(stationName: unknown, area: string): boolean {
  return typeof stationName === 'string' && (stationName === area || stationName.startsWith(area))
}

function latestObservations(items: any[]) {
  const timestamp = (value: string) => Date.parse(`${value.replace(' ', 'T')}+09:00`)
  const now = Date.now()
  return items.map(observation).filter((entry): entry is NonNullable<ReturnType<typeof observation>> => {
    if (!entry) return false
    const age = now - timestamp(entry.measuredAt)
    return age >= -10 * 60 * 1000 && age <= 3 * 60 * 60 * 1000
  })
    .sort((a, b) => timestamp(b.measuredAt) - timestamp(a.measuredAt))
}

function stationLocation(station: any, site: Site) {
  const latitude = measurement(station?.dmX)
  const longitude = measurement(station?.dmY)
  if (latitude === undefined || longitude === undefined || latitude < 32 || latitude > 40 || longitude < 124 || longitude > 132 || !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)) return {}
  const radians = (value: number) => value * Math.PI / 180
  const a = Math.sin(radians(latitude - site.latitude) / 2) ** 2
    + Math.cos(radians(site.latitude)) * Math.cos(radians(latitude)) * Math.sin(radians(longitude - site.longitude) / 2) ** 2
  return { stationLatitude: latitude, stationLongitude: longitude, stationDistanceKm: 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) }
}

export class AirKoreaProvider implements AirQualityProvider {
  readonly source = 'live' as const
  private serviceKey: string
  private stationServiceKey: string

  constructor(serviceKey: string, stationServiceKey = serviceKey) {
    this.serviceKey = normalizeDataGoKrServiceKey(serviceKey)
    this.stationServiceKey = normalizeDataGoKrServiceKey(stationServiceKey)
  }

  private async request(endpoint: string, params: Record<string, string>) {
    const url = new URL(endpoint)
    url.searchParams.set('serviceKey', endpoint === STATION_URL ? this.stationServiceKey : this.serviceKey)
    url.searchParams.set('returnType', 'json')
    url.searchParams.set('pageNo', '1')
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error('request failed')
      const json: any = await res.json()
      if (json?.response?.header?.resultCode !== '00') throw new Error('API result failed')
      const body = json?.response?.body
      if (!Array.isArray(body?.items)) throw new Error('invalid items')
      return { items: body.items as any[], totalCount: measurement(body.totalCount) }
    } catch {
      throw new Error('AirKorea API 조회 실패: 서비스 활용신청·승인 상태 또는 일시적인 통신 오류를 확인하세요')
    }
  }

  async healthCheckStations(): Promise<void> {
    await this.request(STATION_URL, { numOfRows: '1' })
  }

  private async stations() {
    let stations: any[] = []
    // ponytail: 최대 3,000개까지 조회; 목록이 더 크면 불완전한 거리 순위 대신 지역 대체 조회를 사용한다.
    for (let page = 1; page <= 3; page += 1) {
      const body = await this.request(STATION_URL, { numOfRows: '1000', pageNo: String(page) })
      stations = [...stations, ...body.items]
      if (body.totalCount !== undefined ? stations.length >= body.totalCount : body.items.length < 1000) return stations
      if (body.items.length === 0) break
    }
    return []
  }

  private async stationReading(stationName: string) {
    const { items } = await this.request(`${BASE_URL}/getMsrstnAcctoRltmMesureDnsty`, { stationName, numOfRows: '24', dataTerm: 'DAILY', ver: '1.3' })
    return latestObservations(items.filter((item) => !item?.stationName || item.stationName === stationName))[0]
  }

  async getCurrentAirQuality(site: Site): Promise<AirQualityNow> {
    if (site.airkoreaStationName) {
      const selected = await this.stationReading(site.airkoreaStationName)
      if (!selected) throw new Error('AirKorea: 유효한 측정 데이터 없음')
      return this.result(site, selected, { stationName: site.airkoreaStationName, stationSelection: 'configured' })
    }
    const [province, ...areas] = site.address.trim().split(/\s+/)
    let stations: any[] = []
    try {
      stations = await this.stations()
    } catch {
      // 측정소 정보 API는 별도 승인일 수 있으므로 기본 대기질 API로 후퇴한다.
    }
    const candidates = stations.filter((station) => typeof station?.stationName === 'string' && station.stationName.trim())
      .map((station) => ({ station, ...stationLocation(station, site) }))
    const located = candidates.filter((candidate) => candidate.stationDistanceKm !== undefined)
      .sort((a, b) => a.stationDistanceKm! - b.stationDistanceKm!)
    const nearby = located.length ? located : candidates.filter(({ station }) =>
      typeof station.addr === 'string' && (station.addr.startsWith(province) || station.addr.startsWith(SIDO_NAME[province] ?? province))
      && areas.some((area) => station.addr.includes(area)))
    // ponytail: 관측 조회는 가까운 5곳까지; 더 넓은 탐색이 필요하면 이 제한을 늘린다.
    for (const candidate of nearby.slice(0, MAX_STATIONS)) {
      try {
        const selected = await this.stationReading(candidate.station.stationName)
        if (selected) return this.result(site, selected, {
          stationName: candidate.station.stationName,
          stationAddress: typeof candidate.station.addr === 'string' ? candidate.station.addr : undefined,
          stationLatitude: candidate.stationLatitude, stationLongitude: candidate.stationLongitude,
          stationDistanceKm: candidate.stationDistanceKm, stationSelection: located.length ? 'distance' : 'area',
        })
      } catch {
        // 한 측정소의 조회 실패는 다음 후보 조회로 복구한다.
      }
    }
    const { items } = await this.request(`${BASE_URL}/getCtprvnRltmMesureDnsty`, { sidoName: SIDO_NAME[province] ?? province, numOfRows: '1000', ver: '1.3' })
    const observations = latestObservations(items).filter(({ item }) => typeof item.stationName === 'string' && item.stationName.trim())
    const abbreviatedAreas = areas.map((part) => part.replace(/[시군구읍면동리]$/, '')).filter((part) => part.length >= 2)
    const selected = observations.find(({ item }) => areas.some((area) => matchesArea(item.stationName, area)))
      ?? observations.find(({ item }) => abbreviatedAreas.some((area) => matchesArea(item.stationName, area)))
    if (!selected) throw new Error('AirKorea: 유효한 측정 데이터 없음')
    const station = candidates.find((candidate) => candidate.station.stationName === selected.item.stationName)?.station
    return this.result(site, selected, { stationName: selected.item.stationName, stationAddress: typeof station?.addr === 'string' ? station.addr : undefined, stationSelection: 'area' })
  }

  private result(site: Site, selected: NonNullable<ReturnType<typeof observation>>, station: Pick<AirQualityNow, 'stationName' | 'stationAddress' | 'stationLatitude' | 'stationLongitude' | 'stationDistanceKm' | 'stationSelection'>): AirQualityNow {
    const { item, measuredAt, pm10, pm25, o3, chai } = selected
    return {
      siteId: site.id,
      ...station,
      measuredAt,
      pm10,
      pm10Grade: gradeFromCai(item.pm10Grade ?? '2'),
      pm25,
      pm25Grade: gradeFromCai(item.pm25Grade ?? '2'),
      o3,
      o3Grade: gradeFromCai(item.o3Grade ?? '2'),
      chai,
      chaiGrade: gradeFromCai(item.khaiGrade ?? '2'),
    }
  }
}
