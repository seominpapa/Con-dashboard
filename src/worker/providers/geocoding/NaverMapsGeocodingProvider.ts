export interface GeocodingResult {
  latitude: number
  longitude: number
}

export interface AddressSearchResult {
  address: string
  roadAddress?: string
  parcelAddress?: string
}

const API_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode'
const RETRYABLE_STATUS = new Set([502, 503, 504])

export class NaverMapsApiError extends Error {}

function safeError(status: number, fallback: string): NaverMapsApiError {
  if (status === 401 || status === 403) return new NaverMapsApiError('NAVER Cloud Maps 인증 정보 또는 Geocoding 서비스 설정을 확인해 주세요')
  if (status === 429) return new NaverMapsApiError('NAVER Cloud Maps 요청 한도를 초과했습니다')
  return new NaverMapsApiError(`${fallback} (HTTP ${status})`)
}

export class NaverMapsGeocodingProvider {
  private readonly clientId: string
  private readonly clientSecret: string

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId
    this.clientSecret = clientSecret
  }

  async geocode(address: string): Promise<GeocodingResult> {
    const [result] = await this.request(address, 1)
    const longitude = Number(result?.x)
    const latitude = Number(result?.y)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new NaverMapsApiError('주소로 좌표를 찾을 수 없습니다')
    }
    return { latitude, longitude }
  }

  async search(query: string, size = 5): Promise<AddressSearchResult[]> {
    const trimmed = query.trim()
    if (trimmed.length < 2) return []
    const items = await this.request(trimmed, Math.max(1, Math.min(Math.trunc(size), 5)))
    return items.flatMap((item) => {
      const roadAddress = typeof item?.roadAddress === 'string' ? item.roadAddress.trim().slice(0, 200) : undefined
      const parcelAddress = typeof item?.jibunAddress === 'string' ? item.jibunAddress.trim().slice(0, 200) : undefined
      const address = roadAddress || parcelAddress
      return address ? [{ address, roadAddress, parcelAddress }] : []
    })
  }

  private async request(query: string, count: number): Promise<any[]> {
    const trimmed = query.trim()
    if (!trimmed) throw new NaverMapsApiError('주소를 입력해 주세요')
    const clientId = this.clientId.trim()
    const clientSecret = this.clientSecret.trim()
    if (!clientId || !clientSecret) throw new NaverMapsApiError('NAVER Cloud Maps 인증 정보를 확인해 주세요')

    const url = new URL(API_URL)
    url.searchParams.set('query', trimmed)
    url.searchParams.set('page', '1')
    url.searchParams.set('count', String(count))
    const headers = {
      Accept: 'application/json',
      'x-ncp-apigw-api-key-id': clientId,
      'x-ncp-apigw-api-key': clientSecret,
    }
    const deadline = Date.now() + 10_000
    const fetchAttempt = () => fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    })

    let response = await fetchAttempt()
    if (RETRYABLE_STATUS.has(response.status)) response = await fetchAttempt()
    const json: any = await response.json().catch(() => null)
    if (!response.ok) throw safeError(response.status, 'NAVER Cloud Maps 주소 검색에 실패했습니다')
    if (!json || (json.status && json.status !== 'OK') || !Array.isArray(json.addresses)) {
      throw new NaverMapsApiError('NAVER Cloud Maps 응답 형식이 올바르지 않습니다')
    }
    return json.addresses
  }
}
