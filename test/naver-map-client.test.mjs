import assert from 'node:assert/strict'
import { test } from 'node:test'
for (const name of ['window', 'document', 'ResizeObserver']) Object.defineProperty(globalThis, name, { value: undefined, writable: true, configurable: true })

async function setup(t) {
  const scripts = []
  const win = new EventTarget()
  t.mock.property(globalThis, 'window', win)
  t.mock.property(globalThis, 'document', { createElement: () => ({ remove() { this.removed = true } }), head: { appendChild: (el) => scripts.push(el) } })
  const module = await import(`../src/client/lib/naverMap.ts?test=${Math.random()}`)
  return { ...module, scripts, win }
}

test('map loader shares a single SDK with public ID only and rejects key switching', async (t) => {
  const { loadNaverMaps, scripts, win } = await setup(t)
  const first = loadNaverMaps('public123')
  const second = loadNaverMaps('public123')
  assert.equal(scripts.length, 1)
  const url = new URL(scripts[0].src)
  assert.equal(url.origin, 'https://oapi.map.naver.com')
  assert.equal(url.searchParams.get('ncpKeyId'), 'public123')
  assert.deepEqual([...url.searchParams.keys()].sort(), ['callback', 'ncpKeyId'])
  const sdk = { Map: class {} }
  win.naver = { maps: sdk }
  win[url.searchParams.get('callback')]()
  assert.equal(await first, sdk)
  assert.equal(await second, sdk)
  await assert.rejects(loadNaverMaps('changed123'), /새로고침/)
})

test('SDK download failure can retry and auth failure is reported without upstream details', async (t) => {
  const { loadNaverMaps, scripts, win } = await setup(t)
  const first = loadNaverMaps('public123')
  scripts[0].onerror()
  await assert.rejects(first, /불러오지/)
  assert.equal(scripts[0].removed, true)
  const retry = loadNaverMaps('public123')
  win.navermap_authFailure('secret-upstream-message')
  await assert.rejects(retry, (e) => /Dynamic Map/.test(e.message) && !e.message.includes('secret'))
})

test('map lifecycle creates site marker, traffic refresh and cleans up SDK timer/resize/map', async (t) => {
  const { mountTrafficMap } = await setup(t)
  const events = []
  let resized
  t.mock.property(globalThis, 'ResizeObserver', class {
    constructor(cb) { resized = cb }
    observe() { events.push('observe') }
    disconnect() { events.push('disconnect') }
  })
  const maps = {
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng } },
    Map: class {
      constructor(el, options) { assert.equal(options.center.lat, 37.5); events.push('map') }
      setCenter(point) { assert.equal(point.lng, 127); events.push('center') }
      autoResize() { events.push('resize') }
      destroy() { events.push('destroy') }
    },
    Marker: class { constructor(options) { assert.equal(options.position.lng, 127); events.push('marker') } setMap(value) { assert.equal(value, null); events.push('unmark') } },
    TrafficLayer: class {
      constructor(options) { assert.equal(options.interval, 300000) }
      setMap(value) { events.push(value ? 'traffic' : 'detach') }
      refreshRTSVersion() { events.push('version') }
      refresh() { events.push('refresh') }
      endAutoRefresh() { events.push('stop') }
    },
  }
  const map = mountTrafficMap({}, maps, { latitude: 37.5, longitude: 127, name: '현장' })
  resized()
  map.recenter()
  map.refresh()
  map.destroy()
  assert.deepEqual(events, ['map', 'marker', 'traffic', 'observe', 'resize', 'center', 'version', 'refresh', 'disconnect', 'stop', 'detach', 'unmark', 'destroy'])
})
