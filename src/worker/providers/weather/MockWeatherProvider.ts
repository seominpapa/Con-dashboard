import type { WeatherProvider } from './WeatherProvider'
import type { Site } from '../../../shared/types/site'
import type { WeatherNow, WeatherAlert, HourlyForecast, PrecipitationType, SkyCondition } from '../../../shared/types/weather'
import { seededRandom, pick, range, hourSeed } from '../mockRandom'

const SKY_OPTIONS: { sky: SkyCondition; label: string }[] = [
  { sky: 'clear', label: '맑음' },
  { sky: 'partly-cloudy', label: '구름많음' },
  { sky: 'cloudy', label: '흐림' },
]

const PRECIP_OPTIONS: PrecipitationType[] = ['none', 'rain', 'shower']

export class MockWeatherProvider implements WeatherProvider {
  readonly source = 'mock' as const

  async getCurrentWeather(site: Site): Promise<WeatherNow> {
    const rnd = seededRandom(`${site.id}-${hourSeed()}`)
    const skyPick = pick(rnd, SKY_OPTIONS)
    const baseTemp = Math.round(range(rnd, 18, 30))
    const precipProbability = Math.round(range(rnd, 0, 100))
    const precipType: PrecipitationType = precipProbability > 50 ? pick(rnd, PRECIP_OPTIONS) : 'none'
    const windSpeed = Math.round(range(rnd, 1, 12) * 10) / 10

    const hourly: HourlyForecast[] = Array.from({ length: 12 }).map((_, i) => {
      const hourRnd = seededRandom(`${site.id}-${hourSeed()}-h${i}`)
      const t = baseTemp + Math.round(range(hourRnd, -4, 4))
      const p = Math.round(range(hourRnd, 0, 100))
      const now = new Date()
      now.setHours(now.getHours() + i + 1, 0, 0, 0)
      return {
        time: now.toISOString(),
        temperature: t,
        precipitationProbability: p,
        precipitationType: p > 60 ? 'rain' : 'none',
        sky: pick(hourRnd, SKY_OPTIONS).sky,
        windSpeed: Math.round(range(hourRnd, 1, 10) * 10) / 10,
        humidity: Math.round(range(hourRnd, 40, 90)),
      }
    })

    return {
      siteId: site.id,
      siteName: site.name,
      observedAt: new Date().toISOString(),
      temperature: baseTemp,
      minTemperature: baseTemp - Math.round(range(rnd, 3, 8)),
      maxTemperature: baseTemp + Math.round(range(rnd, 2, 6)),
      feelsLike: baseTemp + Math.round(range(rnd, -2, 2)),
      precipitationProbability: precipType === 'none' ? Math.min(precipProbability, 40) : precipProbability,
      expectedRainfall: precipType === 'none' ? '0' : `${Math.round(range(rnd, 1, 30))}`,
      precipitationType: precipType,
      humidity: Math.round(range(rnd, 40, 90)),
      windDirection: pick(rnd, ['북', '북동', '동', '남동', '남', '남서', '서', '북서']),
      windSpeed,
      maxWindSpeed: Math.round((windSpeed + range(rnd, 1, 6)) * 10) / 10,
      snowfall: 0,
      sky: skyPick.sky,
      skyLabel: skyPick.label,
      hourly,
    }
  }

  async getAlerts(site: Site): Promise<WeatherAlert[]> {
    const rnd = seededRandom(`${site.id}-alert-${hourSeed()}`)
    // 대부분의 경우 특보 없음 (현실적인 Mock)
    if (rnd() > 0.25) return []

    const kinds: WeatherAlert['kind'][] = ['호우', '강풍', '폭염', '한파', '대설']
    const levels: WeatherAlert['level'][] = ['주의보', '경보']
    const kind = pick(rnd, kinds)
    const level = pick(rnd, levels)
    const now = new Date()
    return [
      {
        id: `mock-alert-${site.id}-${now.getTime()}`,
        kind,
        level,
        announcedAt: now.toISOString(),
        effectiveAt: now.toISOString(),
        region: site.address.split(' ').slice(0, 2).join(' '),
        title: `${site.address.split(' ').slice(0, 2).join(' ')} ${kind}${level}`,
      },
    ]
  }
}
