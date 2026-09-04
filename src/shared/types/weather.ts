/** 건설날씨 도메인 모델 (기상청 단기예보 기반 정규화 모델) */

export type SkyCondition = 'clear' | 'partly-cloudy' | 'cloudy'
export type PrecipitationType = 'none' | 'rain' | 'rain-snow' | 'snow' | 'shower'

export interface HourlyForecast {
  /** ISO datetime */
  time: string
  temperature: number
  precipitationProbability: number
  precipitationType: PrecipitationType
  sky: SkyCondition
  windSpeed: number
  humidity: number
}

export interface WeatherNow {
  siteId: string
  siteName: string
  observedAt: string
  temperature: number
  minTemperature: number
  maxTemperature: number
  feelsLike: number
  precipitationProbability: number
  /** mm, 범위 표현 문자열 가능 (예: "1~4") */
  expectedRainfall: string
  precipitationType: PrecipitationType
  humidity: number
  windDirection: string
  windSpeed: number
  maxWindSpeed: number
  /** cm */
  snowfall: number
  sky: SkyCondition
  skyLabel: string
  hourly: HourlyForecast[]
}

/** 작업 영향도 레벨 */
export type WorkImpactLevel = 'normal' | 'caution' | 'danger'

export interface WorkImpactItem {
  /** 작업 종류 키 (constructionWeatherRisk.ts의 WORK_TYPES와 매칭) */
  workType: string
  workTypeLabel: string
  level: WorkImpactLevel
  reasons: string[]
}

export interface ConstructionWeatherRisk {
  items: WorkImpactItem[]
  disclaimer: string
}

/** 기상특보 */
export type WeatherAlertKind =
  | '호우'
  | '강풍'
  | '태풍'
  | '폭염'
  | '한파'
  | '대설'
  | '건조'
  | '풍랑'

export type WeatherAlertLevel = '주의보' | '경보'

export interface WeatherAlert {
  id: string
  kind: WeatherAlertKind
  level: WeatherAlertLevel
  announcedAt: string
  effectiveAt: string
  region: string
  title: string
}
