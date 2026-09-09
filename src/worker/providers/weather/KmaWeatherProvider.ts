import type { WeatherProvider } from './WeatherProvider'
import type { Site } from '../../../shared/types/site'
import type {
  WeatherNow,
  WeatherAlert,
  HourlyForecast,
  PrecipitationType,
  SkyCondition,
} from '../../../shared/types/weather'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials.ts'

const BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'
const WARN_URL = 'https://apis.data.go.kr/1360000/WthrWrnInfoService'

/** 기상청 실황/단기예보 코드 -> 하늘상태 매핑 */
function skyCodeToCondition(code: string): { sky: SkyCondition; label: string } {
  switch (code) {
    case '1':
      return { sky: 'clear', label: '맑음' }
    case '3':
      return { sky: 'partly-cloudy', label: '구름많음' }
    case '4':
      return { sky: 'cloudy', label: '흐림' }
    default:
      return { sky: 'clear', label: '맑음' }
  }
}

function ptyCodeToType(code: string): PrecipitationType {
  switch (code) {
    case '0':
      return 'none'
    case '1':
      return 'rain'
    case '2':
      return 'rain-snow'
    case '3':
      return 'snow'
    case '4':
      return 'shower'
    default:
      return 'none'
  }
}

function getBaseDateTime(): { baseDate: string; baseTime: string } {
  // 단기예보 발표시각: 02,05,08,11,14,17,20,23시 (10분 뒤 제공 -> 여유 40분)
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const times = [23, 20, 17, 14, 11, 8, 5, 2]
  let hour = kst.getUTCHours()
  let date = new Date(kst)
  // 발표 후 40분 여유
  const minute = kst.getUTCMinutes()
  let candidate = times.find((t) => hour > t || (hour === t && minute >= 40))
  if (candidate === undefined) {
    // 전날 23시 발표 사용
    date.setUTCDate(date.getUTCDate() - 1)
    candidate = 23
  }
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return { baseDate: `${y}${m}${d}`, baseTime: `${String(candidate).padStart(2, '0')}00` }
}

interface KmaItem {
  category: string
  fcstDate: string
  fcstTime: string
  fcstValue: string
}

export class KmaWeatherProvider implements WeatherProvider {
  readonly source = 'live' as const
  private serviceKey: string

  constructor(serviceKey: string) {
    this.serviceKey = normalizeDataGoKrServiceKey(serviceKey)
  }

  private async fetchVilageFcst(nx: number, ny: number): Promise<KmaItem[]> {
    const { baseDate, baseTime } = getBaseDateTime()
    const url = new URL(`${BASE_URL}/getVilageFcst`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('numOfRows', '1000')
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('dataType', 'JSON')
    url.searchParams.set('base_date', baseDate)
    url.searchParams.set('base_time', baseTime)
    url.searchParams.set('nx', String(nx))
    url.searchParams.set('ny', String(ny))

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`KMA API error: ${res.status}`)
    const json: any = await res.json()
    const header = json?.response?.header
    if (header?.resultCode !== '00') {
      throw new Error(`KMA API resultCode=${header?.resultCode} msg=${header?.resultMsg}`)
    }
    return json?.response?.body?.items?.item ?? []
  }

  async getCurrentWeather(site: Site): Promise<WeatherNow> {
    const items = await this.fetchVilageFcst(site.kmaNx, site.kmaNy)

    // fcstDate+fcstTime 별로 그룹화
    const byTime = new Map<string, Record<string, string>>()
    for (const item of items) {
      const key = `${item.fcstDate}${item.fcstTime}`
      if (!byTime.has(key)) byTime.set(key, {})
      byTime.get(key)![item.category] = item.fcstValue
    }
    const sortedKeys = Array.from(byTime.keys()).sort()
    if (sortedKeys.length === 0) {
      throw new Error('KMA API: no forecast data returned')
    }
    const firstKey = sortedKeys[0]
    const first = byTime.get(firstKey)!

    const hourly: HourlyForecast[] = sortedKeys.slice(0, 12).map((key) => {
      const v = byTime.get(key)!
      const dateStr = key.slice(0, 8)
      const timeStr = key.slice(8, 12)
      const iso = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:00+09:00`
      const skyInfo = skyCodeToCondition(v.SKY ?? '1')
      return {
        time: iso,
        temperature: Number(v.TMP ?? v.T3H ?? 0),
        precipitationProbability: Number(v.POP ?? 0),
        precipitationType: ptyCodeToType(v.PTY ?? '0'),
        sky: skyInfo.sky,
        windSpeed: Number(v.WSD ?? 0),
        humidity: Number(v.REH ?? 0),
      }
    })

    // TMN/TMX는 일 최저/최고 (하루 1~2회만 제공됨)
    const tmnItem = items.find((i) => i.category === 'TMN')
    const tmxItem = items.find((i) => i.category === 'TMX')
    const skyInfo = skyCodeToCondition(first.SKY ?? '1')
    const { baseDate, baseTime } = getBaseDateTime()

    return {
      siteId: site.id,
      siteName: site.name,
      observedAt: `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6, 8)}T${baseTime.slice(0, 2)}:${baseTime.slice(2, 4)}:00+09:00`,
      temperature: Number(first.TMP ?? 0),
      minTemperature: tmnItem ? Number(tmnItem.fcstValue) : Number(first.TMP ?? 0) - 5,
      maxTemperature: tmxItem ? Number(tmxItem.fcstValue) : Number(first.TMP ?? 0) + 5,
      feelsLike: Number(first.TMP ?? 0),
      precipitationProbability: Number(first.POP ?? 0),
      expectedRainfall: first.PCP && first.PCP !== '강수없음' ? first.PCP.replace('mm', '') : '0',
      precipitationType: ptyCodeToType(first.PTY ?? '0'),
      humidity: Number(first.REH ?? 0),
      windDirection: degToDirection(Number(first.VEC ?? 0)),
      windSpeed: Number(first.WSD ?? 0),
      maxWindSpeed: Number(first.WSD ?? 0) + 3,
      snowfall: first.SNO && first.SNO !== '적설없음' ? Number(first.SNO.replace('cm', '')) : 0,
      sky: skyInfo.sky,
      skyLabel: skyInfo.label,
      hourly,
    }
  }

  async getAlerts(site: Site): Promise<WeatherAlert[]> {
    const url = new URL(`${WARN_URL}/getWthrWrnList`)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('numOfRows', '50')
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('dataType', 'JSON')

    const res = await fetch(url.toString())
    if (res.status === 403) {
      throw new Error('KMA 기상특보 API는 단기예보와 별도로 활용신청 및 승인이 필요합니다 (HTTP 403)')
    }
    if (!res.ok) throw new Error(`KMA 특보 API error: ${res.status}`)
    const json: any = await res.json()
    const header = json?.response?.header
    if (header?.resultCode !== '00') {
      // 특보 없음(NODATA)은 정상 케이스로 처리
      if (header?.resultCode === '03') return []
      throw new Error(`KMA 특보 API resultCode=${header?.resultCode}`)
    }
    const items = json?.response?.body?.items?.item ?? []
    const regionKeyword = site.address.split(' ').slice(0, 1)[0] // 시/도 단위로 필터

    // 통보문은 발표·변경·해제가 모두 누적되므로 가장 최근 발표(tmFc) 1건만 현재 상태로 보여준다.
    return [...items]
      .filter((item: any) => !regionKeyword || !item.areaName || String(item.areaName).includes(regionKeyword))
      .sort((a: any, b: any) => String(b.tmFc ?? '').localeCompare(String(a.tmFc ?? '')))
      .slice(0, 1)
      .map((item: any, idx: number) => ({
        id: `kma-alert-${idx}-${item.tmFc ?? ''}`,
        kind: (item.warnVar ?? item.title ?? '호우').replace(/(주의보|경보)/, '').trim(),
        level: (item.title ?? '').includes('경보') ? '경보' : '주의보',
        announcedAt: kmaTimeToIso(item.tmFc),
        effectiveAt: item.tmEf ?? item.tmFc ?? new Date().toISOString(),
        region: item.areaName ?? site.address,
        title: item.title ?? '기상특보',
      }))
  }
}

/** '202609091510' → 2026-09-09T15:10:00+09:00 */
function kmaTimeToIso(value: unknown): string {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value ?? ''))
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00` : new Date().toISOString()
}

function degToDirection(deg: number): string {
  const dirs = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서']
  const idx = Math.round(deg / 22.5) % 16
  return dirs[idx]
}
