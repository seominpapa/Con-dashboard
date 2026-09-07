import type { AirQualityProvider } from './AirQualityProvider'
import type { Site } from '../../../shared/types/site'
import type { AirQualityNow, AirQualityGrade } from '../../../shared/types/air-quality'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials'

const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc'

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

export class AirKoreaProvider implements AirQualityProvider {
  readonly source = 'live' as const
  private serviceKey: string

  constructor(serviceKey: string) {
    this.serviceKey = normalizeDataGoKrServiceKey(serviceKey)
  }

  async getCurrentAirQuality(site: Site): Promise<AirQualityNow> {
    const byStation = Boolean(site.airkoreaStationName)
    const url = new URL(`${BASE_URL}/${byStation ? 'getMsrstnAcctoRltmMesureDnsty' : 'getCtprvnRltmMesureDnsty'}`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('returnType', 'json')
    url.searchParams.set('numOfRows', byStation ? '1' : '100')
    url.searchParams.set('pageNo', '1')
    if (byStation) {
      url.searchParams.set('stationName', site.airkoreaStationName!)
      url.searchParams.set('dataTerm', 'DAILY')
    } else {
      const province = site.address.trim().split(/\s+/)[0]
      url.searchParams.set('sidoName', SIDO_NAME[province] ?? province)
    }
    url.searchParams.set('ver', '1.3')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`AirKorea 실시간 측정 조회 실패: ${res.status}`)
    const json: any = await res.json()
    if (json?.response?.header?.resultCode !== '00') throw new Error(`AirKorea API resultCode=${json?.response?.header?.resultCode}`)
    const items: any[] = json?.response?.body?.items ?? []
    const district = site.address.trim().split(/\s+/)[1]?.replace(/[시군구]$/, '')
    // ponytail: 이름으로 지역을 확인할 수 없으면 실패시킨다. 완전 자동화가 필요하면 TM 좌표 변환을 추가한다.
    const item = byStation ? items[0] : items.find((candidate) => district && String(candidate.stationName ?? '').includes(district))
    if (!item) throw new Error('AirKorea: 측정 데이터 없음')

    const pm10 = Number(item.pm10Value ?? 0)
    const pm25 = Number(item.pm25Value ?? 0)
    const o3 = Number(item.o3Value ?? 0)
    const chai = Number(item.khaiValue ?? 0)

    return {
      siteId: site.id,
      stationName: item.stationName ?? site.airkoreaStationName ?? '',
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
