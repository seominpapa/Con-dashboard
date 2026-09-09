import type { MaterialPriceItem } from '../../../shared/types/market'
import { MATERIAL_CATALOG } from '../../../shared/types/market.ts'
import { todayKeySeoul } from '../../../shared/utils/timezone.ts'
import { normalizeDataGoKrServiceKey } from '../../integrations/publicCredentials.ts'
import type { MaterialPriceProvider } from './MaterialPriceProvider'

const ENDPOINT = 'https://apis.data.go.kr/1230000/ao/PriceInfoService/getPriceInfoListFcltyCmmnMtrilTotal'
export class PpsApiError extends Error {}

const ERROR_GUIDANCE: Record<string, string> = {
  '01': '기관 내부 오류입니다. 잠시 후 다시 시도해 주세요',
  '02': '기관 서비스 제공 상태를 확인해 주세요. 잠시 후 다시 시도해 주세요',
  '03': '조회 결과 없음',
  '04': '기관 API 요청 처리에 실패했습니다',
  '05': '기관 응답 대기시간을 초과했습니다. 잠시 후 다시 시도해 주세요',
  '06': '조회 날짜의 형식이 올바르지 않습니다. 시작일·종료일 형식을 확인해 주세요',
  '07': '요청 입력값의 허용 범위를 초과했습니다. 조회 기간과 요청변수 범위를 확인해 주세요',
  '08': '필수 요청변수가 누락되었습니다. API 요청 항목을 확인해 주세요',
  '10': '조회 요청변수 또는 날짜 형식을 확인해 주세요',
  '11': '필수 요청변수가 누락되었습니다. API 요청 항목을 확인해 주세요',
  '12': 'API 서비스 주소를 확인해 주세요',
  '20': '인증키 전달 및 가격정보현황서비스 활용신청·승인·중지 상태를 확인해 주세요',
  '22': '일일 호출 한도를 초과했습니다. 초기화 이후 재시도하거나 한도 증설을 신청하세요',
  '23': '초당 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요',
  '29': '호출 서버 IP가 차단되었습니다. 활용지원센터에 문의해 주세요',
  '30': '등록되지 않은 인증키입니다. 키와 가격정보현황서비스 활용신청을 확인해 주세요',
  '31': '인증키 사용기간이 만료되었습니다. 공공데이터포털에서 갱신해 주세요',
}

function safePpsError(status: number, code: unknown, structure = ''): PpsApiError {
  // 진단 표시만 정규화한다. 성공 판정은 기존 문자열 '00' 그대로 유지한다.
  const diagnosticCode = typeof code === 'string' && /^\d{2,3}$/.test(code) ? code
    : typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 999 ? String(code).padStart(2, '0') : null
  const detail = diagnosticCode && Object.hasOwn(ERROR_GUIDANCE, diagnosticCode) ? ERROR_GUIDANCE[diagnosticCode]
    : status >= 500 ? '기관 서버 오류입니다. 잠시 후 다시 시도해 주세요' : '알 수 없는 응답입니다. 아래 응답코드를 관리자에게 전달해 주세요'
  // 응답 원문/resultMsg에는 인증키가 포함될 수 있어 숫자 코드만 노출한다.
  const diagnostic = diagnosticCode ? `코드 ${diagnosticCode}` : code == null ? '응답코드 누락' : '응답코드 형식 오류'
  return new PpsApiError(`조달청 가격정보 API: ${detail} (HTTP ${status}, ${diagnostic})${structure ? ` [PPS 구조 v1: ${structure}]` : ''}`)
}

function responseStructure(json: unknown): string {
  const kind = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  // 임시 진단: 고정 경로·자료형만 표시한다. 원인 확인 후 제거하며 원문/임의 필드명은 수집하지 않는다.
  const paths = ['response', 'response.header', 'response.header.resultCode', 'response.body', 'response.resultCode',
    'response.0.header', 'response.0.body', 'header', 'header.resultCode', 'body', 'resultCode', '0.header', '0.body',
    'OpenAPI_ServiceResponse', 'OpenAPI_ServiceResponse.cmmMsgHeader', 'OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode',
    'cmmMsgHeader', 'cmmMsgHeader.returnReasonCode', 'error', 'error.code', 'code', 'status', 'data']
  const fields = paths.flatMap((path) => {
    const value = path.split('.').reduce<unknown>((current, key) =>
      current !== null && typeof current === 'object' && Object.hasOwn(current, key)
        ? (current as Record<string, unknown>)[key] : undefined, json)
    return value === undefined ? [] : [`${path}=${kind(value)}`]
  })
  return [`root=${kind(json)}`, ...fields].join(', ')
}
const KEYWORDS: Record<string, string[]> = {
  rebar: ['철근', '이형봉강'],
  'h-beam': ['H형강', '에이치형강'],
  'steel-plate': ['후판'],
  copper: ['동관', '동판', '구리'],
  aluminum: ['알루미늄'],
  cement: ['시멘트'],
  remicon: ['레미콘', 'ready mixed concrete'],
  asphalt: ['아스팔트'],
  aggregate: ['골재'],
  lumber: ['목재', '제재목'],
  nickel: ['니켈'],
}

function responseEnvelope(json: any): any {
  return json?.response ?? json
}

function asItems(envelope: any): any[] {
  const items = envelope?.body?.items
  if (Array.isArray(items)) return items
  if (Array.isArray(items?.item)) return items.item
  return items?.item ? [items.item] : []
}

function numberFrom(item: any): number {
  for (const key of ['unitPrce', 'unitPrc', 'prce', 'price', 'cntrctPrce', 'stdAmt']) {
    const value = Number(String(item?.[key] ?? '').replaceAll(',', ''))
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

export class PpsMaterialPriceProvider implements MaterialPriceProvider {
  readonly source = 'live' as const
  private serviceKey: string

  constructor(serviceKey: string) {
    this.serviceKey = normalizeDataGoKrServiceKey(serviceKey)
  }

  private async fetchItems(numOfRows = 1000): Promise<any[]> {
    const today = todayKeySeoul().replaceAll('-', '')
    const url = new URL(ENDPOINT)
    url.searchParams.set('serviceKey', this.serviceKey)
    url.searchParams.set('numOfRows', String(numOfRows))
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('inqryDiv', '1')
    url.searchParams.set('inqryBgnDate', today)
    url.searchParams.set('inqryEndDate', today)
    url.searchParams.set('type', 'json')

    let response: Response
    let text: string
    try {
      response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
      text = await response.text()
    } catch (error) {
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
      throw new PpsApiError(timeout ? '조달청 API 응답 대기시간을 초과했습니다. 잠시 후 다시 시도해 주세요' : '조달청 API와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요')
    }
    let json: any
    try { json = JSON.parse(text) } catch { /* 게이트웨이는 JSON 요청에도 XML 오류를 반환한다. */ }
    const envelope = responseEnvelope(json)
    const resultCode = envelope?.header?.resultCode
    const gatewayCode = json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode
      ?? (/^\s*(?:<\?xml[^>]*>\s*)?<OpenAPI_ServiceResponse[\s>]/.test(text)
        ? /<returnReasonCode>\s*(\d{2})\s*<\/returnReasonCode>/.exec(text)?.[1] : undefined)
    const structure = resultCode == null && gatewayCode == null ? responseStructure(json) : ''
    if (!response.ok || gatewayCode !== undefined) throw safePpsError(response.status, gatewayCode ?? resultCode, structure)
    if (!json) throw new PpsApiError(`조달청 API 응답 형식이 올바르지 않습니다 (HTTP ${response.status})`)
    if (resultCode === '03') return []
    if (resultCode !== '00') throw safePpsError(response.status, resultCode, structure)
    if (!envelope.body || typeof envelope.body !== 'object') throw new PpsApiError(`조달청 API 응답 형식이 올바르지 않습니다 (HTTP ${response.status})`)
    return asItems(envelope)
  }

  async healthCheck(): Promise<string> {
    const items = await this.fetchItems(1)
    return items.length ? '조달청 가격정보 API 연결 확인 완료' : '조달청 가격정보 API 연결 확인 완료 · 조회 결과 없음 (선택 기간 내 자료 없음)'
  }

  async getPrices(materialKeys: string[]): Promise<MaterialPriceItem[]> {
    const items = await this.fetchItems()
    const result = materialKeys.flatMap((materialKey) => {
      const catalog = MATERIAL_CATALOG.find((entry) => entry.key === materialKey)
      const keywords = KEYWORDS[materialKey]
      if (!catalog || !keywords) return []
      const item = items.find((candidate) => keywords.some((keyword) => JSON.stringify(candidate).toLowerCase().includes(keyword.toLowerCase())))
      const price = numberFrom(item)
      if (!item || !price) return []
      const updatedAt = item.nticeDt ?? item.stdrDt ?? item.priceBasisDate ?? item.dataCrtrYmd ?? new Date().toISOString()
      return [{
        materialKey,
        label: catalog.label,
        price,
        unit: item.unit ?? item.unitNm ?? item.cntrctUnit ?? catalog.unit,
        currency: 'KRW',
        changeRate: 0,
        direction: 'flat' as const,
        hasTrend: false,
        source: '조달청 나라장터 가격정보현황서비스',
        updatedAt,
        isMock: false,
      }]
    })
    if (result.length !== materialKeys.length) throw new Error('PPS API 응답에 선택한 자재 가격이 없습니다')
    return result
  }
}
