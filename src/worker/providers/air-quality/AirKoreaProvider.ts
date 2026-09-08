import type { AirQualityProvider } from './AirQualityProvider'
import type { Site } from '../../../shared/types/site'
import type { AirQualityNow, AirQualityGrade } from '../../../shared/types/air-quality'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials.ts'

const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc'
const STATION_URL = 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList'

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

      const stationRes = await fetch(stationUrl.toString(), { signal: AbortSignal.timeout(10_000) })
      if (!stationRes.ok) throw new Error(`AirKorea 측정소 조회 실패: ${stationRes.status}`)
      const stationJson: any = await stationRes.json()
      if (stationJson?.response?.header?.resultCode !== '00') {
        throw new Error(`AirKorea 측정소 API resultCode=${stationJson?.response?.header?.resultCode}`)
      }
      const stations: any[] = stationJson?.response?.body?.items ?? []
      const station = stations.find((candidate) => addressParts.slice(1).some((part) => String(candidate.addr ?? '').includes(part))) ?? stations[0]
      stationName = station?.stationName
      if (!stationName) throw new Error('AirKorea: 주소와 일치하는 측정소 없음')
    }

    const url = new URL(`${BASE_URL}/getMsrstnAcctoRltmMesureDnsty`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('returnType', 'json')
    url.searchParams.set('numOfRows', '1')
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('stationName', stationName)
    url.searchParams.set('dataTerm', 'DAILY')
    url.searchParams.set('ver', '1.3')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`AirKorea 실시간 측정 조회 실패: ${res.status}`)
    const json: any = await res.json()
    if (json?.response?.header?.resultCode !== '00') throw new Error(`AirKorea API resultCode=${json?.response?.header?.resultCode}`)
    const items: any[] = json?.response?.body?.items ?? []
    const item = items[0]
    if (!item) throw new Error('AirKorea: 측정 데이터 없음')

    const pm10 = Number(item.pm10Value ?? 0)
    const pm25 = Number(item.pm25Value ?? 0)
    const o3 = Number(item.o3Value ?? 0)
    const chai = Number(item.khaiValue ?? 0)

    return {
      siteId: site.id,
      stationName: item.stationName ?? stationName,
      measuredAt: item.dataTime ?? new Date().toISOString(),
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
