import type { ApiEnvelope } from '../../shared/types/common'

/**
 * 서버 API 공통 호출 래퍼.
 * - 모든 요청에 credentials 포함 (세션 쿠키 전달)
 * - ApiEnvelope<T> 형태로 통일된 응답을 그대로 반환한다.
 * - 네트워크/HTTP 오류도 ApiEnvelope 형태(status:'error')로 정규화하여
 *   호출부(Widget 등)가 항상 동일한 방식으로 처리할 수 있게 한다.
 */
async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) {
      // 관리자 승인/인증 에러는 서버가 {status, message, code} 형태로 내려준다
      return {
        status: 'error',
        data: null,
        updatedAt: new Date().toISOString(),
        source: 'live',
        message: json?.message ?? `요청 실패 (${res.status})`,
      }
    }
    return json as ApiEnvelope<T>
  } catch (err: any) {
    return {
      status: 'error',
      data: null,
      updatedAt: new Date().toISOString(),
      source: 'live',
      message: err?.message ?? '네트워크 오류가 발생했습니다',
    }
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
