/** 관리자 API 연결센터 도메인 모델 (기획 33~34, 52) */

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'EXPIRED' | 'CHECKING'
export type IntegrationType = 'public_api' | 'ai_provider'

export type PublicApiProviderKey = 'kma' | 'kma_alert' | 'airkorea' | 'airkorea_station' | 'g2b' | 'material_prices' | 'law' | 'ecos' | 'naver_maps' | 'naver_dynamic_map' | 'its'
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
  expiresAt?: string | null
  daysUntilExpiry?: number | null
  /** 서버 환경변수로도 설정 가능한 provider인지 (관리자 DB 미설정 시 ENV로 자동 폴백됨을 안내) */
  envFallbackAvailable: boolean
}

export const PUBLIC_API_PROVIDERS: { key: PublicApiProviderKey; label: string; envVar: string; docsUrl?: string }[] = [
  { key: 'kma', label: '기상청', envVar: 'KMA_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15084084/openapi.do' },
  { key: 'kma_alert', label: '기상청 기상특보', envVar: 'KMA_ALERT_SERVICE_KEY / KMA_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15000415/openapi.do' },
  { key: 'airkorea', label: 'AirKorea', envVar: 'AIRKOREA_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15073861/openapi.do' },
  { key: 'airkorea_station', label: 'AirKorea 측정소정보', envVar: 'AIRKOREA_STATION_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15073877/openapi.do' },
  { key: 'g2b', label: '나라장터', envVar: 'G2B_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15129394/openapi.do' },
  { key: 'material_prices', label: '건설시장·주요자재가격(조달청)', envVar: 'MATERIAL_PRICE_SERVICE_KEY / G2B_SERVICE_KEY', docsUrl: 'https://www.data.go.kr/data/15129415/openapi.do' },
  { key: 'law', label: '국가법령정보', envVar: 'LAW_OC', docsUrl: 'https://open.law.go.kr/LSO/usrJoin.do' },
  { key: 'ecos', label: '한국은행 ECOS (환율·생산자물가지수)', envVar: 'ECOS_API_KEY', docsUrl: 'https://ecos.bok.or.kr/api/' },
  { key: 'naver_maps', label: 'NAVER Cloud Maps 주소 검색', envVar: 'NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET', docsUrl: 'https://console.ncloud.com/naver-service/application' },
  { key: 'naver_dynamic_map', label: 'NAVER Dynamic Map 교통지도', envVar: 'NAVER_DYNAMIC_MAP_CLIENT_ID', docsUrl: 'https://console.ncloud.com/naver-service/application' },
  { key: 'its', label: '국가교통정보센터(ITS)', envVar: 'ITS_API_KEY', docsUrl: 'https://www.data.go.kr/data/15040463/openapi.do' },
]

export const AI_PROVIDERS: { key: AiProviderKey; label: string }[] = [
  { key: 'claude', label: 'Anthropic API (Claude)' },
  { key: 'codex', label: 'OpenAI API' },
]
