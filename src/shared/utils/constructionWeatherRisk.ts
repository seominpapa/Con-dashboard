/**
 * 건설 작업 영향(Weather Risk) Rule Engine
 *
 * ⚠️ 중요: 이 모듈이 산출하는 "작업 영향" 정보는 참고용 판단 보조 도구이며,
 * 법적 작업중지 기준을 단정하지 않는다. 실제 작업 가능 여부는 관련 법령,
 * 현장 안전기준 및 관리자의 판단에 따라 결정해야 한다.
 */
import type { WorkImpactItem, WorkImpactLevel, WeatherNow } from '../types/weather'

export const WORK_TYPE_LABEL: Record<string, string> = {
  earthwork: '토공',
  concrete: '콘크리트',
  crane: '크레인',
  'high-place': '고소작업',
  waterproof: '방수',
  outdoor: '옥외작업',
  equipment: '장비/차량',
}

function levelRank(level: WorkImpactLevel): number {
  return level === 'danger' ? 2 : level === 'caution' ? 1 : 0
}

function maxLevel(a: WorkImpactLevel, b: WorkImpactLevel): WorkImpactLevel {
  return levelRank(a) >= levelRank(b) ? a : b
}

interface Accumulator {
  level: WorkImpactLevel
  reasons: string[]
}

function addReason(acc: Record<string, Accumulator>, workType: string, level: WorkImpactLevel, reason: string) {
  if (!acc[workType]) acc[workType] = { level: 'normal', reasons: [] }
  acc[workType].level = maxLevel(acc[workType].level, level)
  acc[workType].reasons.push(reason)
}

/**
 * 기상 데이터를 기반으로 공종별 작업 영향도를 산출한다.
 * Rule은 다음 기준을 따른다 (참고용):
 * - 강수량/강수확률 증가 → 토공/콘크리트/방수 영향 증가
 * - 풍속 증가 → 크레인/고소작업 영향 증가
 * - 고온 → 옥외작업/열사병 위험 증가
 * - 저온 → 콘크리트 타설/양생 영향 증가
 * - 적설(눈) → 장비/차량/옥외작업 영향 증가
 */
export function evaluateConstructionWeatherRisk(weather: WeatherNow): WorkImpactItem[] {
  const acc: Record<string, Accumulator> = {}
  const precipMm = parseExpectedRainfall(weather.expectedRainfall)

  // 강수확률/강수량 → 토공, 콘크리트, 방수
  if (weather.precipitationProbability >= 80 || precipMm >= 20) {
    addReason(acc, 'earthwork', 'danger', `강수확률 ${weather.precipitationProbability}%, 예상강우 ${weather.expectedRainfall}mm`)
    addReason(acc, 'concrete', 'danger', '높은 강우량으로 타설/양생 품질 저하 우려')
    addReason(acc, 'waterproof', 'danger', '강우 중 방수시공 불가 수준')
  } else if (weather.precipitationProbability >= 60 || precipMm >= 5) {
    addReason(acc, 'earthwork', 'caution', `강수확률 ${weather.precipitationProbability}%`)
    addReason(acc, 'concrete', 'caution', '강우로 타설 품질 영향 가능')
    addReason(acc, 'waterproof', 'caution', '강우 시 방수시공 품질 저하 가능')
  } else if (weather.precipitationProbability >= 30) {
    addReason(acc, 'earthwork', 'caution', '약한 강수 가능성')
  }

  // 풍속 → 크레인, 고소작업
  if (weather.maxWindSpeed >= 14 || weather.windSpeed >= 10) {
    addReason(acc, 'crane', 'danger', `최대풍속 ${weather.maxWindSpeed}m/s`)
    addReason(acc, 'high-place', 'danger', `풍속 ${weather.windSpeed}m/s로 고소작업 위험 증가`)
  } else if (weather.maxWindSpeed >= 10 || weather.windSpeed >= 8) {
    addReason(acc, 'crane', 'caution', `최대풍속 ${weather.maxWindSpeed}m/s`)
    addReason(acc, 'high-place', 'caution', `풍속 ${weather.windSpeed}m/s`)
  }

  // 고온 → 옥외작업
  if (weather.maxTemperature >= 35) {
    addReason(acc, 'outdoor', 'danger', `최고기온 ${weather.maxTemperature}℃, 열사병 위험 매우 높음`)
  } else if (weather.maxTemperature >= 31) {
    addReason(acc, 'outdoor', 'caution', `최고기온 ${weather.maxTemperature}℃, 온열질환 주의`)
  }

  // 저온 → 콘크리트
  if (weather.minTemperature <= -5) {
    addReason(acc, 'concrete', 'danger', `최저기온 ${weather.minTemperature}℃, 동해 위험`)
    addReason(acc, 'outdoor', 'caution', `최저기온 ${weather.minTemperature}℃, 한랭질환 주의`)
  } else if (weather.minTemperature <= 4) {
    addReason(acc, 'concrete', 'caution', `최저기온 ${weather.minTemperature}℃, 양생 영향 가능`)
  }

  // 적설/눈
  if (weather.precipitationType === 'snow' || weather.precipitationType === 'rain-snow') {
    addReason(acc, 'equipment', 'caution', '강설로 장비/차량 이동 영향')
    addReason(acc, 'outdoor', 'caution', '결빙 및 미끄럼 위험')
    if (weather.snowfall >= 5) {
      addReason(acc, 'equipment', 'danger', `예상 적설량 ${weather.snowfall}cm`)
    }
  }

  // 기본값 채우기 (언급 안 된 공종은 정상)
  const allTypes = Object.keys(WORK_TYPE_LABEL)
  const result: WorkImpactItem[] = allTypes.map((wt) => {
    const item = acc[wt]
    return {
      workType: wt,
      workTypeLabel: WORK_TYPE_LABEL[wt],
      level: item?.level ?? 'normal',
      reasons: item?.reasons ?? [],
    }
  })

  // 핵심 4개 공종만 우선 노출 (기획 예시: 토공/콘크리트/크레인/고소작업)
  const priorityOrder = ['earthwork', 'concrete', 'crane', 'high-place']
  result.sort((a, b) => priorityOrder.indexOf(a.workType) - priorityOrder.indexOf(b.workType))

  return result
}

function parseExpectedRainfall(text: string): number {
  const match = text.match(/[\d.]+/)
  return match ? parseFloat(match[0]) : 0
}

export const WEATHER_RISK_DISCLAIMER =
  '작업 영향 정보는 참고용이며 실제 작업 여부는 관련 법령, 현장 안전기준 및 관리자의 판단에 따라 결정해야 합니다.'
