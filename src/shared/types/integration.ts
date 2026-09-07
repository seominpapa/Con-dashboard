/** 관리자 API 연결센터 도메인 모델 (기획 33~34, 52) */

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED' | 'CHECKING'
export type IntegrationType = 'public_api' | 'ai_provider'

export type PublicApiProviderKey = 'kma' | 'airkorea' | 'g2b' | 'law' | 'ecos' | 'opinet' | 'naver' | 'vworld'
export type AiProviderKey = 'claude' | 'codex'

export const OPENAI_MODELS = ['gpt-5.1', 'gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5-mini', 'gpt-4.1'] as const
export type OpenAIModel = (typeof OPENAI_MODELS)[number]

export interface IntegrationSummary {
  provider: string
  type: IntegrationType
  status: IntegrationStatus
  /** 민감정보 제외 메타데이터 (예: 계정 라벨) */
  metadata: Record<string, unknown> | null
  connectedAt?: string | null
  lastCheckedAt?: string | null
  lastSuccessAt?: string | null
  lastError?: string | null
  updatedBy?: string | null
  /** 서버 환경변수로도 설정 가능한 provider인지 (관리자 DB 미설정 시 ENV로 자동 폴백됨을 안내) */
  envFallbackAvailable: boolean
}

export const PUBLIC_API_PROVIDERS: { key: PublicApiProviderKey; label: string; envVar: string; docsUrl?: string }[] = [
  { key: 'kma', label: '기상청', envVar: 'KMA_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15084084/openapi.do' },
  { key: 'airkorea', label: 'AirKorea', envVar: 'AIRKOREA_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15073861/openapi.do' },
  { key: 'g2b', label: '나라장터', envVar: 'G2B_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15129394/openapi.do' },
  { key: 'law', label: '국가법령정보', envVar: 'LAW_API_KEY', docsUrl: 'https://open.law.go.kr/LSO/usrJoin.do' },
  { key: 'ecos', label: '환율(한국은행 ECOS)', envVar: 'ECOS_API_KEY', docsUrl: 'https://ecos.bok.or.kr/api/' },
  { key: 'opinet', label: '유가(Opinet)', envVar: 'OPINET_API_KEY', docsUrl: 'https://www.opinet.co.kr/user/custapi/openApiIntro.do' },
  { key: 'naver', label: '네이버 뉴스(보완)', envVar: 'NAVER_CLIENT_ID/SECRET', docsUrl: 'https://console.ncloud.com/naver-api-hub' },
  { key: 'vworld', label: 'VWorld 주소 좌표 변환', envVar: 'VWORLD_API_KEY', docsUrl: 'https://www.vworld.kr/dtna/dtna_apiSvcFc_s001.do' },
]

export const AI_PROVIDERS: { key: AiProviderKey; label: string }[] = [
  { key: 'claude', label: 'Anthropic API (Claude)' },
  { key: 'codex', label: 'OpenAI API' },
]
