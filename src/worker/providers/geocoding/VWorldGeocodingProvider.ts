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

export class VWorldGeocodingProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
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

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error('주소 좌표 변환에 실패했습니다')

    const json: any = await res.json()
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

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error('주소 검색에 실패했습니다')

    const json: any = await res.json()
    if (json?.response?.status === 'ERROR') throw new Error('주소 검색에 실패했습니다')
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
