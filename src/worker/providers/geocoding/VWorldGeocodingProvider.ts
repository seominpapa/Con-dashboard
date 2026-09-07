export interface GeocodingResult {
  latitude: number
  longitude: number
}

const API_URL = 'https://api.vworld.kr/req/address'

export class VWorldGeocodingProvider {
  constructor(private apiKey: string) {}

  async geocode(address: string): Promise<GeocodingResult> {
    const query = address.trim()
    if (!query) throw new Error('주소를 입력해 주세요')

    return (await this.tryType(query, 'ROAD')) ?? (await this.tryType(query, 'PARCEL')) ?? fail()
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
}

function fail(): never {
  throw new Error('주소로 좌표를 찾을 수 없습니다')
}
