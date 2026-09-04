/**
 * 타임존 유틸리티 (기획 41번)
 * 기본은 Asia/Seoul이며, 향후 사용자별 Timezone 지원을 위해 이 모듈만 확장하면 된다.
 */
export const DEFAULT_TIMEZONE = 'Asia/Seoul'

/** 주어진 시각(기본: 현재)을 지정 타임존 기준 YYYY-MM-DD 문자열로 변환 */
export function getDateKeyInTimezone(date: Date = new Date(), timezone: string = DEFAULT_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date) // en-CA locale formats as YYYY-MM-DD
}

export function todayKeySeoul(): string {
  return getDateKeyInTimezone(new Date(), DEFAULT_TIMEZONE)
}
