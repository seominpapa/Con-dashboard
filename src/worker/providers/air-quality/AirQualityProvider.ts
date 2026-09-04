import type { Site } from '../../../shared/types/site'
import type { AirQualityNow } from '../../../shared/types/air-quality'
import type { DataSource } from '../../../shared/types/common'

export interface AirQualityProvider {
  readonly source: DataSource
  getCurrentAirQuality(site: Site): Promise<AirQualityNow>
}
