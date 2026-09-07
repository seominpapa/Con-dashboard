export interface GeocodingResult {
  latitude: number
  longitude: number
}

export interface AddressSearchResult {
  address: string
  roadAddress?: string
  parcelAddress?: string
}

const API_URL = 'https://api.vworld.kr/req/address'
const SEARCH_URL = 'https://api.vworld.kr/req/search'

export class VWorldApiError extends Error {}

function vworldError(json: any, fallback: string): VWorldApiError | null {
  if (json?.response?.status !== 'ERROR') return null
  const code = json?.response?.error?.code
  if (code === 'INVALID_KEY') return new VWorldApiError('VWorld 인증키가 유효하지 않습니다. 인증키를 다시 확인해 주세요')
  if (code === 'INVALID_DOMAIN') return new VWorldApiError('VWorld 인증키에 등록된 서비스 URL이 현재 사이트 주소와 일치하지 않습니다')
  return new VWorldApiError(code === 'SYSTEM_ERROR' ? `${fallback} (오류 코드: SYSTEM_ERROR)` : fallback)
}

async function readVWorldResponse(res: Response, fallback: string): Promise<any> {
  const json = await res.json().catch(() => null)
  const error = json && vworldError(json, fallback)
  if (error) throw error
  if (!res.ok) throw new VWorldApiError(`${fallback} (HTTP ${res.status})`)
  if (!json) throw new VWorldApiError(`${fallback} (응답 형식 오류)`)
  return json
}

export class VWorldGeocodingProvider {
  private apiKey: string
  private domain?: string

  constructor(apiKey: string, domain?: string) {
    this.apiKey = apiKey
    this.domain = domain
  }

  async geocode(address: string): Promise<GeocodingResult> {
    const query = address.trim()
    if (!query) throw new Error('주소를 입력해 주세요')

    return (await this.tryType(query, 'ROAD')) ?? (await this.tryType(query, 'PARCEL')) ?? fail()
  }

  async search(query: string, size = 5): Promise<AddressSearchResult[]> {
    const trimmed = query.trim()
    if (trimmed.length < 2) return []
    const limit = Math.max(1, Math.min(Math.trunc(size), 5))

    const roads = await this.searchCategory(trimmed, 'road', limit)
    return roads.length ? roads : this.searchCategory(trimmed, 'parcel', limit)
  }

  private async tryType(address: string, type: 'ROAD' | 'PARCEL'): Promise<GeocodingResult | null> {
    const url = new URL(API_URL)
    url.searchParams.set('service', 'address')
    url.searchParams.set('request', 'getcoord')
    url.searchParams.set('version', '2.0')
    url.searchParams.set('crs', 'epsg:4326')
    url.searchParams.set('type', type)
    url.searchParams.set('format', 'json')
    url.searchParams.set('address', address)
    url.searchParams.set('key', this.apiKey)
    if (this.domain) url.searchParams.set('domain', this.domain)

    const res = await fetch(url.toString())
    const json = await readVWorldResponse(res, 'VWorld 주소 좌표 변환에 실패했습니다')
    const point = json?.response?.result?.point
    const longitude = Number(point?.x)
    const latitude = Number(point?.y)
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ? { latitude, longitude }
      : null
  }

  private async searchCategory(query: string, category: 'road' | 'parcel', size: number): Promise<AddressSearchResult[]> {
    const url = new URL(SEARCH_URL)
    url.searchParams.set('service', 'search')
    url.searchParams.set('request', 'search')
    url.searchParams.set('version', '2.0')
    url.searchParams.set('crs', 'epsg:4326')
    url.searchParams.set('size', String(size))
    url.searchParams.set('page', '1')
    url.searchParams.set('query', query)
    url.searchParams.set('type', 'address')
    url.searchParams.set('category', category)
    url.searchParams.set('format', 'json')
    url.searchParams.set('key', this.apiKey)
    if (this.domain) url.searchParams.set('domain', this.domain)

    const res = await fetch(url.toString())
    const json = await readVWorldResponse(res, 'VWorld 주소 검색에 실패했습니다')
    const items = Array.isArray(json?.response?.result?.items) ? json.response.result.items : []
    return items.flatMap((item: any) => {
      const roadAddress = typeof item?.address?.road === 'string' ? item.address.road.trim().slice(0, 200) : undefined
      const parcelAddress = typeof item?.address?.parcel === 'string' ? item.address.parcel.trim().slice(0, 200) : undefined
      const address = roadAddress || parcelAddress
      return address ? [{ address, roadAddress, parcelAddress }] : []
    })
  }
}

function fail(): never {
  throw new Error('주소로 좌표를 찾을 수 없습니다')
}
