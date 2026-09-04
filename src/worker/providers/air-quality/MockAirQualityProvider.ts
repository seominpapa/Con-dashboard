import type { AirQualityProvider } from './AirQualityProvider'
import type { Site } from '../../../shared/types/site'
import type { AirQualityNow, AirQualityGrade } from '../../../shared/types/air-quality'
import { seededRandom, range, hourSeed } from '../mockRandom'

function gradeOf(value: number, thresholds: [number, number, number]): AirQualityGrade {
  if (value <= thresholds[0]) return 'good'
  if (value <= thresholds[1]) return 'moderate'
  if (value <= thresholds[2]) return 'bad'
  return 'very-bad'
}

export class MockAirQualityProvider implements AirQualityProvider {
  readonly source = 'mock' as const

  async getCurrentAirQuality(site: Site): Promise<AirQualityNow> {
    const rnd = seededRandom(`${site.id}-air-${hourSeed()}`)
    const pm10 = Math.round(range(rnd, 10, 90))
    const pm25 = Math.round(range(rnd, 5, 60))
    const o3 = Math.round(range(rnd, 10, 80)) / 1000
    const chai = Math.round(range(rnd, 30, 150))

    return {
      siteId: site.id,
      stationName: site.airkoreaStationName ?? `${site.address.split(' ').slice(0, 2).join(' ')} 측정소`,
      measuredAt: new Date().toISOString(),
      pm10,
      pm10Grade: gradeOf(pm10, [30, 80, 150]),
      pm25,
      pm25Grade: gradeOf(pm25, [15, 35, 75]),
      o3,
      o3Grade: gradeOf(o3 * 1000, [30, 90, 150]),
      chai,
      chaiGrade: gradeOf(chai, [50, 100, 150]),
    }
  }
}
