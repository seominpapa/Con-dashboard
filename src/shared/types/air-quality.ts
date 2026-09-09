/** 대기질 도메인 모델 (AirKorea 정규화) */

export type AirQualityGrade = 'good' | 'moderate' | 'bad' | 'very-bad'

export interface AirQualityNow {
  siteId: string
  stationName: string
  stationAddress?: string
  stationLatitude?: number
  stationLongitude?: number
  stationDistanceKm?: number
  stationSelection?: 'configured' | 'distance' | 'area'
  measuredAt: string
  pm10: number
  pm10Grade: AirQualityGrade
  pm25: number
  pm25Grade: AirQualityGrade
  o3: number
  o3Grade: AirQualityGrade
  /** 통합대기환경지수 */
  chai: number
  chaiGrade: AirQualityGrade
}

export const AIR_QUALITY_GRADE_LABEL: Record<AirQualityGrade, string> = {
  good: '좋음',
  moderate: '보통',
  bad: '나쁨',
  'very-bad': '매우나쁨',
}
