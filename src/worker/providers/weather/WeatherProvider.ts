import type { Site } from '../../../shared/types/site'
import type { WeatherNow, WeatherAlert } from '../../../shared/types/weather'
import type { DataSource } from '../../../shared/types/common'

/**
 * WeatherProvider 인터페이스
 * - KmaWeatherProvider(실제 기상청 API), MockWeatherProvider(개발용) 등
 *   여러 구현체가 이 인터페이스를 따른다.
 * - Widget/Route는 이 인터페이스만 알고 있으면 되므로, 데이터 출처가
 *   바뀌어도 Widget 코드를 수정할 필요가 없다.
 */
export interface WeatherProvider {
  readonly source: DataSource
  getCurrentWeather(site: Site): Promise<WeatherNow>
  getAlerts(site: Site): Promise<WeatherAlert[]>
}
