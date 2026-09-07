import type { PublicApiProviderKey } from '../../shared/types/integration'

const REQUIRED_FIELDS: Record<PublicApiProviderKey, readonly string[]> = {
  kma: ['apiKey'],
  airkorea: ['apiKey'],
  g2b: ['apiKey'],
  law: ['apiKey'],
  ecos: ['apiKey'],
  opinet: ['apiKey'],
  naver: ['clientId', 'clientSecret'],
  vworld: ['apiKey'],
}

const FAILURE_LABELS: Record<PublicApiProviderKey, string> = {
  kma: '기상청',
  airkorea: 'AirKorea',
  g2b: '나라장터',
  law: '국가법령정보',
  ecos: '한국은행 ECOS',
  opinet: 'Opinet',
  naver: '네이버 뉴스',
  vworld: 'VWorld 주소 좌표 변환',
}

type CredentialValidation =
  | { valid: true; credential: Record<string, string> }
  | { valid: false; message: string }

export function validatePublicCredential(provider: PublicApiProviderKey, input: unknown): CredentialValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, message: '자격증명 형식이 올바르지 않습니다' }
  }

  const fields = REQUIRED_FIELDS[provider]
  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.some(([key]) => !fields.includes(key))) {
    return { valid: false, message: '허용되지 않은 자격증명 필드가 포함되어 있습니다' }
  }

  const credential: Record<string, string> = {}
  for (const field of fields) {
    const value = (input as Record<string, unknown>)[field]
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) {
      return { valid: false, message: '필수 자격증명을 모두 입력해 주세요' }
    }
    credential[field] = value.trim()
  }

  return { valid: true, credential }
}

export function publicProviderFailureMessage(provider: PublicApiProviderKey): string {
  return `${FAILURE_LABELS[provider]} API 연결 확인에 실패했습니다`
}
