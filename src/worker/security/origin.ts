export function isSameOriginMutation(requestUrl: string, origin: string | null, referer: string | null): boolean {
  try {
    const source = origin || (referer ? new URL(referer).origin : null)
    return Boolean(source && new URL(source).origin === new URL(requestUrl).origin)
  } catch {
    return false
  }
}
