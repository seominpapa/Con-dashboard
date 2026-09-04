/**
 * 관리자 API Credential 암호화 유틸 (기획 34번)
 * - Cloudflare Workers의 Web Crypto API(AES-GCM)를 사용한다.
 * - 평문 Credential은 절대 DB에 저장하지 않는다.
 * - 암호화 키는 AUTH_SECRET 환경변수로부터 파생한다.
 */

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 평문 문자열(주로 JSON.stringify된 credential 객체)을 암호화하여
 * "iv(base64).ciphertext(base64)" 형태의 저장용 문자열로 반환한다.
 */
export async function encryptCredential(plainText: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText))
  return `${toBase64(iv.buffer)}.${toBase64(ciphertext)}`
}

/**
 * encryptCredential로 저장된 문자열을 복호화한다.
 * 서버 내부(Provider 호출 직전)에서만 호출하며, 복호화 결과를
 * 절대 Client Response에 포함시키지 않는다.
 */
export async function decryptCredential(stored: string, secret: string): Promise<string> {
  const [ivB64, dataB64] = stored.split('.')
  if (!ivB64 || !dataB64) throw new Error('잘못된 암호화 데이터 형식')
  const key = await deriveKey(secret)
  const iv = fromBase64(ivB64)
  const ciphertext = fromBase64(dataB64)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plainBuf)
}

export function getAuthSecret(env: { AUTH_SECRET?: string }): string {
  // 개발환경 기본값 (운영 배포 전 반드시 AUTH_SECRET 환경변수로 교체해야 함)
  return env.AUTH_SECRET || 'dev-only-insecure-default-secret-change-me'
}
