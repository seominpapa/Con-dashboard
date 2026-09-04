/**
 * Cloudflare Workers 환경변수 타입
 * - 모든 외부 API 인증키는 서버(Worker) 환경변수로만 존재한다.
 * - 절대 Client Browser에 노출하지 않는다.
 */
export interface Bindings {
  KMA_SERVICE_KEY?: string
  AIRKOREA_SERVICE_KEY?: string
  G2B_SERVICE_KEY?: string
  LAW_API_KEY?: string
  ECOS_API_KEY?: string
  OPINET_API_KEY?: string
  NAVER_CLIENT_ID?: string
  NAVER_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

export type AppEnv = {
  Bindings: Bindings
}
