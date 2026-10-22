export function isSameOriginMutation(requestUrl: string, origin: string | null, referer: string | null): boolean {
  try {
    const source = origin || (referer ? new URL(referer).origin : null)
    return Boolean(source && new URL(source).origin === new URL(requestUrl).origin)
  } catch {
    return false
  }
}

export function useSecureCookies(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return true
  }
}
