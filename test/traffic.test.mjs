import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { ItsTrafficProvider } from '../src/worker/providers/traffic/ItsTrafficProvider.ts'
import { withCache } from '../src/worker/cache/memoryCache.ts'
import { canUseStaleTraffic } from '../src/shared/types/traffic.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const site = { id: 'site-1', latitude: 37.5665, longitude: 126.9780 }

test('ITS provider requests both nearby feeds with a WGS84 bounding box and normalizes them', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    if (url.pathname.includes('trafficInfo')) {
      return new Response(JSON.stringify({
        header: { resultCode: 0 },
        body: { items: [{ roadName: '세종대로', speed: 34, travelTime: 120, direction: '시청 방면', status: '원활' }, { roadName: '세종대로', speed: 28, travelTime: 120, direction: '시청 방면', status: '원활' }] },
      }))
    }
    if (url.pathname.includes('eventInfo')) {
      return new Response(JSON.stringify({
        header: { resultCode: '0' },
        body: { items: { item: [{ title: '공사로 인한 부분 통제', roadName: '세종대로', type: 'its', eventType: 'cor', description: '1차로 통제', startDate: '2026-09-08T08:00:00Z' }] } },
      }))
    }
    throw new Error(`unexpected endpoint: ${url.pathname}`)
  }

  try {
    const traffic = await new ItsTrafficProvider('test-key').getNearbyTraffic(site)
    assert.equal(calls.length, 2)
    assert.ok(calls.some((url) => url.pathname.includes('trafficInfo')))
    assert.ok(calls.some((url) => url.pathname.includes('eventInfo')))
    for (const url of calls) {
      assert.equal(url.searchParams.get('apiKey'), 'test-key')
      for (const key of ['minX', 'maxX', 'minY', 'maxY']) assert.notEqual(url.searchParams.get(key), null)
      assert.ok(Number(url.searchParams.get('minX')) < site.longitude)
      assert.ok(Number(url.searchParams.get('maxX')) > site.longitude)
      assert.ok(Number(url.searchParams.get('minY')) < site.latitude)
      assert.ok(Number(url.searchParams.get('maxY')) > site.latitude)
      assert.equal(url.searchParams.get('getType'), 'json')
    }
    const eventCall = calls.find((url) => url.pathname.includes('eventInfo'))
    assert.equal(eventCall.searchParams.get('eventType'), 'all')
    assert.deepEqual(traffic.roads, [{
      roadName: '세종대로', speedKph: 28, travelTimeSeconds: 120, direction: '시청 방면', status: '원활',
    }])
    assert.deepEqual(traffic.incidents[0] && {
      title: traffic.incidents[0].title,
      roadName: traffic.incidents[0].roadName,
      type: traffic.incidents[0].type,
      description: traffic.incidents[0].description,
      startedAt: traffic.incidents[0].startedAt,
    }, {
      title: '공사로 인한 부분 통제', roadName: '세종대로', type: '공사', description: '1차로 통제', startedAt: '2026-09-08T08:00:00Z',
    })
    assert.ok(Number.isFinite(Date.parse(traffic.observedAt)))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('ITS provider keeps live traffic when the incident feed fails and never exposes its key', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname.includes('trafficInfo')) {
      return new Response(JSON.stringify({ body: { data: [{ roadName: '을지로', speed: 12, status: '정체' }] } }))
    }
    return new Response('upstream failure includes secret-key', { status: 503 })
  }

  try {
    const traffic = await new ItsTrafficProvider('secret-key').getNearbyTraffic(site)
    assert.deepEqual(traffic.roads[0] && {
      roadName: traffic.roads[0].roadName,
      speedKph: traffic.roads[0].speedKph,
      status: traffic.roads[0].status,
    }, { roadName: '을지로', speedKph: 12, status: '정체' })
    assert.deepEqual(traffic.incidents, [])

    globalThis.fetch = async () => new Response('upstream failure includes secret-key', { status: 503 })
    await assert.rejects(
      () => new ItsTrafficProvider('secret-key').getNearbyTraffic(site),
      (error) => {
        assert.doesNotMatch(error.message, /secret-key/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('traffic upstream calls have a deadline and reject oversized responses', async () => {
  const originalFetch = globalThis.fetch
  const signals = []
  globalThis.fetch = async (_input, init) => {
    signals.push(init?.signal)
    return new Response('{}', { headers: { 'content-length': '3000000' } })
  }
  try {
    await assert.rejects(() => new ItsTrafficProvider('test-key').getNearbyTraffic(site), /ITS 교통정보 API/)
    assert.equal(signals.length, 2)
    assert.ok(signals.every((signal) => signal instanceof AbortSignal))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('cache coalesces concurrent traffic refreshes for the same site', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    await Promise.resolve()
    return { roads: [] }
  }
  const key = `traffic-test-${Date.now()}-${Math.random()}`
  const [first, second] = await Promise.all([withCache(key, 1000, fetcher), withCache(key, 1000, fetcher)])
  assert.equal(calls, 1)
  assert.deepEqual(first.value, second.value)
})

test('stale traffic is used for at most thirty minutes', () => {
  const now = Date.parse('2026-09-08T10:00:00.000Z')
  const snapshot = { observedAt: '2026-09-08T09:45:00.000Z' }
  assert.equal(canUseStaleTraffic(snapshot, now), true)
  assert.equal(canUseStaleTraffic({ observedAt: '2026-09-08T09:29:59.000Z' }, now), false)
  assert.equal(canUseStaleTraffic({ observedAt: 'invalid' }, now), false)
})

test('nearby traffic is wired through the protected API, admin credentials, and widget registry', () => {
  assert.equal(existsSync(new URL('../src/worker/providers/traffic/ItsTrafficProvider.ts', import.meta.url)), true)
  assert.equal(existsSync(new URL('../src/worker/routes/traffic.ts', import.meta.url)), true)
  assert.equal(existsSync(new URL('../src/client/widgets/NearbyTrafficWidget.tsx', import.meta.url)), true)

  const integrationTypes = read('src/shared/types/integration.ts')
  const credentials = read('src/worker/integrations/publicCredentials.ts')
  const adminRoute = read('src/worker/routes/admin/integrations.ts')
  const worker = read('src/worker/index.ts')
  const route = read('src/worker/routes/traffic.ts')
  const widgetHook = read('src/client/hooks/useWidgetData.ts')
  const registry = read('src/client/widgets/registry.ts')
  const widget = read('src/client/widgets/NearbyTrafficWidget.tsx')
  const adminUi = read('src/client/pages/admin/AdminIntegrationsPage.tsx')

  assert.match(integrationTypes, /'its'/)
  assert.match(integrationTypes, /ITS_API_KEY/)
  assert.match(credentials, /its:\s*\['apiKey'\]/)
  assert.match(adminRoute, /its:\s*\['ITS_API_KEY'\]/)
  assert.match(worker, /trafficRoutes/)
  assert.match(worker, /api\.route\('\/traffic',\s*trafficRoutes\)/)
  assert.match(route, /consumeFixedWindow\(`traffic_rate:\$\{user\.id\}`/)
  assert.match(route, /stale:\s*true/)
  assert.match(widgetHook, /setStale\(Boolean\(res\.stale\)\)/)
  assert.match(registry, /NearbyTrafficWidget/)
  assert.match(registry, /id:\s*'nearbyTraffic'/)
  assert.match(widget, /\/api\/traffic\?siteId=/)
  assert.match(integrationTypes, /15040463/)
  assert.match(adminUi, /15040465/)
})

test('nearby traffic widget renders accessible congestion graphics and incident details', () => {
  const widget = read('src/client/widgets/NearbyTrafficWidget.tsx')

  assert.match(widget, /role="img"/)
  assert.match(widget, /aria-label=\{`\$\{road\.roadName\}/)
  assert.match(widget, /STATUS_VISUAL\[road\.status\]/)
  assert.match(widget, /road\.speedKph\s*\/\s*80/)
  assert.match(widget, /정체 구간/)
  assert.match(widget, /incident\.type/)
  assert.match(widget, /incident\.description/)
})
