/** 관리자 API 연결센터 도메인 모델 (기획 33~34, 52) */

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED' | 'CHECKING'
export type IntegrationType = 'public_api' | 'ai_provider'

export type PublicApiProviderKey = 'kma' | 'airkorea' | 'g2b' | 'law' | 'ecos' | 'opinet' | 'naver'
export type AiProviderKey = 'claude' | 'codex'

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

export const PUBLIC_API_PROVIDERS: { key: PublicApiProviderKey; label: string; envVar: string }[] = [
  { key: 'kma', label: '기상청', envVar: 'KMA_SERVICE_KEY' },
  { key: 'airkorea', label: 'AirKorea', envVar: 'AIRKOREA_SERVICE_KEY' },
  { key: 'g2b', label: '나라장터', envVar: 'G2B_SERVICE_KEY' },
  { key: 'law', label: '국가법령정보', envVar: 'LAW_API_KEY' },
  { key: 'ecos', label: '환율(한국은행 ECOS)', envVar: 'ECOS_API_KEY' },
  { key: 'opinet', label: '유가(Opinet)', envVar: 'OPINET_API_KEY' },
  { key: 'naver', label: '네이버 뉴스(보완)', envVar: 'NAVER_CLIENT_ID/SECRET' },
]

export const AI_PROVIDERS: { key: AiProviderKey; label: string }[] = [
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex / OpenAI' },
]
