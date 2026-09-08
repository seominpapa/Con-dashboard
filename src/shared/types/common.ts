/**
 * 공통 타입 정의
 * - 모든 외부 데이터 API 응답은 이 Envelope 구조로 정규화되어 Client에 전달된다.
 * - Provider(Mock/Real) -> Normalize -> ApiEnvelope<T> -> Widget
 */

export type DataStatus = 'success' | 'empty' | 'error'

/** 데이터 출처: 실제 공공API 연동인지, 개발용 Mock 데이터인지 명확히 구분 */
export type DataSource = 'live' | 'mock' | 'unconfigured'

export interface ApiEnvelope<T> {
  status: DataStatus
  data: T | null
  /** 데이터를 실제 조회/생성한 시각 (ISO string) */
  updatedAt: string
  /** live: 실제 공공API, mock: 목업데이터, unconfigured: 서버에 API Key 미설정 */
  source: DataSource
  /** 에러/안내 메시지 (사용자 노출용) */
  message?: string
  /** 응답이 캐시에서 제공되었는지 여부 */
  cached?: boolean
  /** 만료된 마지막 정상 데이터를 표시하는지 여부 */
  stale?: boolean
}

export function ok<T>(data: T, source: DataSource, message?: string): ApiEnvelope<T> {
  return {
    status: 'success',
    data,
    updatedAt: new Date().toISOString(),
    source,
    message,
  }
}

export function empty<T>(source: DataSource, message?: string): ApiEnvelope<T> {
  return {
    status: 'empty',
    data: null,
    updatedAt: new Date().toISOString(),
    source,
    message,
  }
}

export function fail<T>(message: string, source: DataSource = 'live'): ApiEnvelope<T> {
  return {
    status: 'error',
    data: null,
    updatedAt: new Date().toISOString(),
    source,
    message,
  }
}

/** Widget 내부 상태 머신 (기획 22번 항목) */
export type WidgetDataState = 'loading' | 'success' | 'empty' | 'error' | 'stale'

export type TrendDirection = 'up' | 'down' | 'flat'

export interface TrendPoint {
  label: string
  value: number
}
