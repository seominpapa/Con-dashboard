import type { AirQualityProvider } from './AirQualityProvider'
import type { Site } from '../../../shared/types/site'
import type { AirQualityNow, AirQualityGrade } from '../../../shared/types/air-quality'

const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc'
const STATION_URL = 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc'

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
  constructor(private serviceKey: string) {}

  private async findNearestStation(site: Site): Promise<string> {
    if (site.airkoreaStationName) return site.airkoreaStationName

    const url = new URL(`${STATION_URL}/getNearbyMsrstnList`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('returnType', 'json')
    url.searchParams.set('tmX', String(site.longitude))
    url.searchParams.set('tmY', String(site.latitude))
    url.searchParams.set('ver', '1.1')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`AirKorea 측정소 조회 실패: ${res.status}`)
    const json: any = await res.json()
    const items = json?.response?.body?.items ?? []
    if (items.length === 0) throw new Error('AirKorea: 근접 측정소를 찾을 수 없습니다')
    return items[0].stationName
  }

  async getCurrentAirQuality(site: Site): Promise<AirQualityNow> {
    const stationName = await this.findNearestStation(site)

    const url = new URL(`${BASE_URL}/getMsrstnAcctoRltmMesureDnsty`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('returnType', 'json')
    url.searchParams.set('numOfRows', '1')
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('stationName', stationName)
    url.searchParams.set('dataTerm', 'DAILY')
    url.searchParams.set('ver', '1.3')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`AirKorea 실시간 측정 조회 실패: ${res.status}`)
    const json: any = await res.json()
    const item = json?.response?.body?.items?.[0]
    if (!item) throw new Error('AirKorea: 측정 데이터 없음')

    const pm10 = Number(item.pm10Value ?? 0)
    const pm25 = Number(item.pm25Value ?? 0)
    const o3 = Number(item.o3Value ?? 0)
    const chai = Number(item.khaiValue ?? 0)

    return {
      siteId: site.id,
      stationName,
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
