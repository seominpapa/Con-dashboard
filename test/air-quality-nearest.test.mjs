import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { AirKoreaProvider } from '../src/worker/providers/air-quality/AirKoreaProvider.ts'

const site = { id: 'nearest-site', address: '경기도 안성시 양성면', latitude: 37, longitude: 127.2 }
const reading = (stationName, overrides = {}) => ({ stationName, dataTime: '2026-09-09 10:00', pm10Value: '21', pm25Value: '9', o3Value: '0.02', khaiValue: '42', ...overrides })
const station = (stationName, latitude, addr = `경기도 안성시 ${stationName}`) => ({ stationName, addr, dmX: String(latitude), dmY: '127.2' })
const response = (items, totalCount = items.length) => new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items, totalCount } } }))
beforeEach((t) => t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-09T01:30:00Z') }))

test('coordinate ranking skips missing nearby measurements and returns the next station with its actual location', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    requests.push(url)
    if (url.pathname.endsWith('/getMsrstnList')) return response([station('먼측정소', 37.2), station('가까운측정소', 37.001), station('다음측정소', 37.01, '경기도 평택시 실제주소')])
    const name = url.searchParams.get('stationName')
    return response([reading(name, name === '가까운측정소' ? { pm10Value: '-' } : {})])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.deepEqual(requests.slice(1).map((url) => url.searchParams.get('stationName')), ['가까운측정소', '다음측정소'])
  assert.equal(requests[0].searchParams.has('addr'), false)
  assert.equal(result.stationName, '다음측정소')
  assert.equal(result.stationAddress, '경기도 평택시 실제주소')
  assert.equal(result.stationLatitude, 37.01)
  assert.equal(result.stationLongitude, 127.2)
  assert.ok(result.stationDistanceKm > 1 && result.stationDistanceKm < 1.2)
  assert.equal(result.stationSelection, 'distance')
})

test('station history selects the latest valid observation regardless of API ordering', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response([reading('안성', { dataTime: '2026-09-09 08:00', pm10Value: '40' }), reading('안성')]))
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality({ ...site, airkoreaStationName: '안성' })
  assert.equal(result.measuredAt, '2026-09-09 10:00')
  assert.equal(result.pm10, 21)
  assert.equal(result.stationSelection, 'configured')
})

test('province fallback states that distance and address are unavailable instead of inventing them', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => String(input).includes('getMsrstnList') ? new Response('', { status: 403 }) : response([reading('안성')]))
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.equal(result.stationSelection, 'area')
  assert.equal(result.stationAddress, undefined)
  assert.equal(result.stationDistanceKm, undefined)
})

test('incomplete recent readings do not make an old historical reading current', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) return response([station('가까운측정소', 37.001), station('다음측정소', 37.01)])
    const name = url.searchParams.get('stationName')
    return name === '가까운측정소'
      ? response([reading(name, { pm10Value: '-' }), reading(name, { dataTime: '2026-09-08 10:00' })])
      : response([reading(name)])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.equal(result.stationName, '다음측정소')
})

test('ranking includes later catalog pages and skips malformed station coordinates', async (t) => {
  const pages = []
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) {
      pages.push(url.searchParams.get('pageNo'))
      return pages.length === 1
        ? response([station('먼측정소', 37.5), station('잘못된좌표', 127.2)], 3)
        : response([station('가까운측정소', 37.001)], 3)
    }
    return response([reading(url.searchParams.get('stationName'))])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.deepEqual(pages, ['1', '2'])
  assert.equal(result.stationName, '가까운측정소')
})

test('station failures are bounded to five candidates before an explicitly labelled province fallback', async (t) => {
  let directCalls = 0
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) return response(Array.from({ length: 8 }, (_, index) => station(`측정소${index}`, 37 + index / 100)))
    if (url.pathname.endsWith('/getMsrstnAcctoRltmMesureDnsty')) {
      directCalls += 1
      throw new Error(`request failed: ${url}`)
    }
    return response([reading('안성')])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.equal(directCalls, 5)
  assert.equal(result.stationName, '안성')
  assert.equal(result.stationSelection, 'area')
})

test('an incomplete capped catalog cannot claim to contain the closest station', async (t) => {
  let catalogCalls = 0
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) {
      catalogCalls += 1
      return response([station(`측정소${catalogCalls}`, 37.01)], 4000)
    }
    assert.match(url.pathname, /getCtprvnRltmMesureDnsty$/)
    return response([reading('안성')])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.equal(catalogCalls, 3)
  assert.equal(result.stationSelection, 'area')
  assert.equal(result.stationDistanceKm, undefined)
})

test('upstream network errors cannot expose the service key in the provider error', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => { throw new Error(String(input)) })
  await assert.rejects(new AirKoreaProvider('private-test-key').getCurrentAirQuality({ ...site, airkoreaStationName: '안성' }), (error) => {
    assert.match(error.message, /AirKorea API 조회 실패/)
    assert.doesNotMatch(error.message, /private-test-key|serviceKey|https:/)
    return true
  })
})

test('a stale nearest station does not beat a fresh next station even when its response contains no newer history', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) return response([station('가까운측정소', 37.001), station('다음측정소', 37.01)])
    const name = url.searchParams.get('stationName')
    return response([reading(name, name === '가까운측정소' ? { dataTime: '2026-09-08 10:00' } : {})])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.equal(result.stationName, '다음측정소')
})

test('out-of-Korea placeholder coordinates cannot be ranked as station locations', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) return response([{ stationName: '안성', addr: '경기도 안성시 실제주소', dmX: '0', dmY: '0' }])
    return response([reading('안성')])
  })
  const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
  assert.equal(result.stationSelection, 'area')
  assert.equal(result.stationDistanceKm, undefined)
  assert.equal(result.stationLatitude, undefined)
})

test('observations beyond the future clock tolerance are rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response([reading('안성', { dataTime: '2026-09-09 11:00' })]))
  await assert.rejects(new AirKoreaProvider('test-key').getCurrentAirQuality({ ...site, airkoreaStationName: '안성' }), /유효한 측정 데이터 없음/)
})
