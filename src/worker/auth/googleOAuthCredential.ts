export interface GoogleOAuthCredential {
  clientId: string
  clientSecret: string
}

type ValidationResult =
  | { valid: true; credential: GoogleOAuthCredential }
  | { valid: false; message: string }

export function validateGoogleOAuthCredential(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, message: 'OAuth 자격증명 형식이 올바르지 않습니다' }
  }
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== 'clientId' && key !== 'clientSecret')) {
    return { valid: false, message: '허용되지 않은 OAuth 필드가 포함되어 있습니다' }
  }
  const clientId = typeof value.clientId === 'string' ? value.clientId.trim() : ''
  const clientSecret = typeof value.clientSecret === 'string' ? value.clientSecret.trim() : ''
  if (!clientId.endsWith('.apps.googleusercontent.com') || !clientSecret || clientId.length > 4096 || clientSecret.length > 4096) {
    return { valid: false, message: 'Google OAuth Client ID와 Client Secret을 확인해 주세요' }
  }
  return { valid: true, credential: { clientId, clientSecret } }
}

export function selectGoogleOAuthCredential(
  forceEnvironment: boolean,
  stored: GoogleOAuthCredential | null,
  environment: GoogleOAuthCredential | null,
): GoogleOAuthCredential | null {
  return forceEnvironment ? environment : stored ?? environment
}
