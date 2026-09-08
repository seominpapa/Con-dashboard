import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AirKoreaProvider } from '../src/worker/providers/air-quality/AirKoreaProvider.ts'
import { KmaWeatherProvider } from '../src/worker/providers/weather/KmaWeatherProvider.ts'

const site = {
  id: 'site-1',
  name: '안성 현장',
  company: '테스트',
  address: '경기도 안성시 양성면',
  latitude: 37.0,
  longitude: 127.2,
  kmaNx: 62,
  kmaNy: 114,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'active',
}

test('KMA warning 403 explains that warning API approval is separate from forecast access', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 403 })
  try {
    await assert.rejects(
      new KmaWeatherProvider('test-key').getAlerts(site),
      /기상특보 API.*별도.*활용신청.*승인/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('KMA warning responses with numeric station ids do not crash regional filtering', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: {
      header: { resultCode: '00' },
      body: { items: { item: [{ stnId: 108, areaName: '경기도 안성시', title: '호우주의보', tmFc: '202609081000' }] } },
    },
  }))
  try {
    const alerts = await new KmaWeatherProvider('test-key').getAlerts(site)
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].region, '경기도 안성시')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AirKorea resolves a station from the site address before requesting realtime measurements', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const signals = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push(url)
    signals.push(init?.signal)
    if (url.pathname.endsWith('/getMsrstnList')) {
      return new Response(JSON.stringify({
        response: {
          header: { resultCode: '00' },
          body: { items: [{ stationName: '안성', addr: '경기도 안성시 봉산동' }] },
        },
      }))
    }
    if (url.pathname.endsWith('/getMsrstnAcctoRltmMesureDnsty')) {
      assert.equal(url.searchParams.get('stationName'), '안성')
      return new Response(JSON.stringify({
        response: {
          header: { resultCode: '00' },
          body: { items: [{ stationName: '안성', dataTime: '2026-09-08 10:00', pm10Value: '21', pm25Value: '9', o3Value: '0.02', khaiValue: '42', pm10Grade: '1', pm25Grade: '1', o3Grade: '1', khaiGrade: '1' }] },
        },
      }))
    }
    return new Response('', { status: 404 })
  }

  try {
    const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
    assert.equal(calls.length, 2)
    assert.match(calls[0].pathname, /MsrstnInfoInqireSvc\/getMsrstnList$/)
    assert.equal(calls[0].searchParams.get('addr'), '안성시')
    assert.ok(signals.every((signal) => signal instanceof AbortSignal))
    assert.equal(result.stationName, '안성')
    assert.equal(result.pm10, 21)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AirKorea falls back to the approved province feed when station lookup is forbidden', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    if (url.pathname.endsWith('/getMsrstnList')) return new Response('', { status: 403 })
    if (url.pathname.endsWith('/getCtprvnRltmMesureDnsty')) {
      assert.equal(url.searchParams.get('sidoName'), '경기')
      return new Response(JSON.stringify({
        response: {
          header: { resultCode: '00' },
          body: { items: [
            { stationName: '수원', dataTime: '2026-09-08 10:00', pm10Value: '31', pm25Value: '15', o3Value: '0.03', khaiValue: '55', pm10Grade: '2', pm25Grade: '2', o3Grade: '1', khaiGrade: '2' },
            { stationName: '안성', dataTime: '2026-09-08 10:00', pm10Value: '21', pm25Value: '9', o3Value: '0.02', khaiValue: '42', pm10Grade: '1', pm25Grade: '1', o3Grade: '1', khaiGrade: '1' },
          ] },
        },
      }))
    }
    return new Response('', { status: 404 })
  }

  try {
    const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
    assert.equal(calls.length, 2)
    assert.match(calls[1].pathname, /getCtprvnRltmMesureDnsty$/)
    assert.equal(result.stationName, '안성')
    assert.equal(result.pm10, 21)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AirKorea keeps an explicitly configured station on the direct realtime endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    assert.match(url.pathname, /getMsrstnAcctoRltmMesureDnsty$/)
    assert.equal(url.searchParams.get('stationName'), '안성')
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: '00' },
        body: { items: [{ stationName: '안성', dataTime: '2026-09-08 10:00', pm10Value: '18', pm25Value: '8', o3Value: '0.01', khaiValue: '35', pm10Grade: '1', pm25Grade: '1', o3Grade: '1', khaiGrade: '1' }] },
      },
    }))
  }
  try {
    const result = await new AirKoreaProvider('test-key').getCurrentAirQuality({ ...site, airkoreaStationName: '안성' })
    assert.equal(calls.length, 1)
    assert.equal(result.stationName, '안성')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AirKorea skips incomplete matched observations instead of reporting missing values as zero', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) return new Response('', { status: 403 })
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: '00' },
        body: { items: [
          { stationName: '안성', dataTime: '2026-09-08 11:00', pm10Value: '-', pm25Value: '9', o3Value: '0.02', khaiValue: '42' },
          { stationName: '안성', dataTime: '2026-09-08 10:00', pm10Value: '21', pm25Value: '9', o3Value: '0.02', khaiValue: '42', pm10Grade: '1', pm25Grade: '1', o3Grade: '1', khaiGrade: '1' },
        ] },
      },
    }))
  }
  try {
    const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(site)
    assert.equal(result.measuredAt, '2026-09-08 10:00')
    assert.equal(result.pm10, 21)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AirKorea rejects a response with no complete observations', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: {
      header: { resultCode: '00' },
      body: { items: [{ stationName: '안성', dataTime: '', pm10Value: '21', pm25Value: '9', o3Value: '-', khaiValue: '42' }] },
    },
  }))
  try {
    await assert.rejects(
      new AirKoreaProvider('test-key').getCurrentAirQuality({ ...site, airkoreaStationName: '안성' }),
      /AirKorea: 유효한 측정 데이터 없음/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AirKorea does not confuse a short district name with a different district', async () => {
  const originalFetch = globalThis.fetch
  const seoulSite = { ...site, address: '서울특별시 중구 필동' }
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/getMsrstnList')) return new Response('', { status: 403 })
    return new Response(JSON.stringify({
      response: {
        header: { resultCode: '00' },
        body: { items: [
          { stationName: '중랑구', dataTime: '2026-09-08 10:00', pm10Value: '31', pm25Value: '15', o3Value: '0.03', khaiValue: '55' },
          { stationName: '중구', dataTime: '2026-09-08 10:00', pm10Value: '21', pm25Value: '9', o3Value: '0.02', khaiValue: '42' },
        ] },
      },
    }))
  }
  try {
    const result = await new AirKoreaProvider('test-key').getCurrentAirQuality(seoulSite)
    assert.equal(result.stationName, '중구')
  } finally {
    globalThis.fetch = originalFetch
  }
})
