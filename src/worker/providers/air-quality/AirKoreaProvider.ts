import type { AirQualityProvider } from './AirQualityProvider'
import type { Site } from '../../../shared/types/site'
import type { AirQualityNow, AirQualityGrade } from '../../../shared/types/air-quality'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials.ts'

const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc'
const STATION_URL = 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList'

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

export class AirKoreaProvider implements AirQualityProvider {
  readonly source = 'live' as const
  private serviceKey: string

  constructor(serviceKey: string) {
    this.serviceKey = normalizeDataGoKrServiceKey(serviceKey)
  }

  async getCurrentAirQuality(site: Site): Promise<AirQualityNow> {
    let stationName = site.airkoreaStationName
    if (!stationName) {
      const addressParts = site.address.trim().split(/\s+/)
      const stationUrl = new URL(STATION_URL)
      stationUrl.searchParams.set('serviceKey', this.serviceKey)
      stationUrl.searchParams.set('returnType', 'json')
      stationUrl.searchParams.set('numOfRows', '100')
      stationUrl.searchParams.set('pageNo', '1')
      stationUrl.searchParams.set('addr', addressParts[1] ?? addressParts[0] ?? '')

      try {
        const stationRes = await fetch(stationUrl.toString(), { signal: AbortSignal.timeout(10_000) })
        if (!stationRes.ok) throw new Error(`AirKorea 측정소 조회 실패: ${stationRes.status}`)
        const stationJson: any = await stationRes.json()
        if (stationJson?.response?.header?.resultCode !== '00') throw new Error('AirKorea 측정소 API 요청 실패')
        const stations: any[] = stationJson?.response?.body?.items ?? []
        const station = stations.find((candidate) => addressParts.slice(1).some((part) => String(candidate.addr ?? '').includes(part))) ?? stations[0]
        stationName = station?.stationName
      } catch {
        // 측정소 정보 API는 별도 승인일 수 있으므로 기본 대기질 API로 후퇴한다.
      }
    }

    const byStation = Boolean(stationName)
    const url = new URL(`${BASE_URL}/${byStation ? 'getMsrstnAcctoRltmMesureDnsty' : 'getCtprvnRltmMesureDnsty'}`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('returnType', 'json')
    url.searchParams.set('numOfRows', byStation ? '24' : '100')
    url.searchParams.set('pageNo', '1')
    if (byStation) {
      url.searchParams.set('stationName', stationName!)
      url.searchParams.set('dataTerm', 'DAILY')
    } else {
      const province = site.address.trim().split(/\s+/)[0]
      url.searchParams.set('sidoName', SIDO_NAME[province] ?? province)
    }
    url.searchParams.set('ver', '1.3')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`AirKorea 실시간 측정 조회 실패: ${res.status}`)
    const json: any = await res.json()
    if (json?.response?.header?.resultCode !== '00') throw new Error(`AirKorea API resultCode=${json?.response?.header?.resultCode}`)
    const items: any[] = json?.response?.body?.items ?? []
    const observations = items.map(observation).filter((item): item is NonNullable<ReturnType<typeof observation>> => item !== null)
    const areas = site.address.trim().split(/\s+/).slice(1)
    const abbreviatedAreas = areas.map((part) => part.replace(/[시군구읍면동리]$/, '')).filter((part) => part.length >= 2)
    // ponytail: 시도별 API에 거리가 없으므로 행정구역명을 가장 가까운 측정소 기준으로 사용한다.
    const selected = byStation
      ? observations[0]
      : observations.find(({ item }) => areas.some((area) => matchesArea(item.stationName, area)))
        ?? observations.find(({ item }) => abbreviatedAreas.some((area) => matchesArea(item.stationName, area)))
    if (!selected) throw new Error('AirKorea: 유효한 측정 데이터 없음')
    const { item, measuredAt, pm10, pm25, o3, chai } = selected

    return {
      siteId: site.id,
      stationName: item.stationName ?? stationName,
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
