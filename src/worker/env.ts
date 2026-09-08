/**
 * Cloudflare Workers 환경변수 타입
 * - 모든 외부 API 인증키는 서버(Worker) 환경변수로만 존재한다.
 * - 절대 Client Browser에 노출하지 않는다.
 */
export interface Bindings {
  DB: D1Database

  // ---- 인증/세션 ----
  /** 세션 서명/암호화에 사용하는 서버 비밀키. 미설정 시 개발용 기본값 사용(운영 배포 전 반드시 설정) */
  AUTH_SECRET?: string
  /** 최초 부트스트랩 관리자 이메일. 해당 Google 계정 최초 로그인 시 ADMIN+APPROVED로 생성 */
  INITIAL_ADMIN_EMAIL?: string
  /** true로 설정하면 부트스트랩 관리자 자동승격 로직을 비활성화 (운영 전환용) */
  DISABLE_ADMIN_BOOTSTRAP?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** OAuth Redirect에 사용할 서비스 기준 URL (예: https://xxx.pages.dev) */
  APP_BASE_URL?: string

  // ---- 공공데이터 Provider ----
  KMA_SERVICE_KEY?: string
  AIRKOREA_SERVICE_KEY?: string
  G2B_SERVICE_KEY?: string
  LAW_OC?: string
  /** @deprecated LAW_OC 사용 권장 */
  LAW_API_KEY?: string
  ECOS_API_KEY?: string
  OPINET_API_KEY?: string
  VWORLD_API_KEY?: string
  ITS_API_KEY?: string

  // ---- LLM Provider (관리자가 /admin/integrations/ai 에서 DB로 연결 관리, ENV는 폴백/초기값) ----
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
}

export type AppEnv = {
  Bindings: Bindings
}
