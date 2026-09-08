import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { VWorldGeocodingProvider } from '../src/worker/providers/geocoding/VWorldGeocodingProvider.ts'
import { cacheGet, cacheGetStale, cacheSet, withCache } from '../src/worker/cache/memoryCache.ts'
import { SettingsRepository } from '../src/worker/repositories/SettingsRepository.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { EcosExchangeRateProvider } = await vite.ssrLoadModule('/src/worker/providers/exchange/EcosExchangeRateProvider.ts')
const { default: adminIntegrations } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
after(() => vite.close())

test('VWorld geocoding is wired into site creation and admin integration metadata', () => {
  assert.equal(existsSync(new URL('../src/worker/providers/geocoding/VWorldGeocodingProvider.ts', import.meta.url)), true)

  const integrationTypes = read('src/shared/types/integration.ts')
  assert.match(integrationTypes, /'vworld'/)
  assert.match(integrationTypes, /VWORLD_API_KEY/)
  assert.match(integrationTypes, /www\.vworld\.kr/)

  const credentials = read('src/worker/integrations/publicCredentials.ts')
  assert.match(credentials, /vworld:\s*\['apiKey'\]/)

  const sitesRoute = read('src/worker/routes/sites.ts')
  const adminIntegrationsRoute = read('src/worker/routes/admin/integrations.ts')
  const wranglerConfig = read('wrangler.jsonc')
  assert.match(sitesRoute, /VWorldGeocodingProvider/)
  assert.match(sitesRoute, /geocodeSiteAddress/)
  assert.match(sitesRoute, /if \(!apiKey\) throw new VWorldApiError/)
  assert.match(sitesRoute, /app\.get\('\/address-search'/)
  assert.doesNotMatch(sitesRoute, /위도\/경도가 필요합니다/)
  assert.match(sitesRoute, /latLonToKmaGrid\(coords\.latitude,\s*coords\.longitude\)/)
  assert.match(sitesRoute, /MAX_ADDRESS_LENGTH/)
  assert.match(sitesRoute, /body\.address !== existing\.address/)
  assert.match(sitesRoute, /err instanceof VWorldApiError/)
  assert.match(adminIntegrationsRoute, /provider === 'vworld' \? new URL/)
  assert.doesNotMatch(wranglerConfig, /"vars"\s*:\s*\{[^}]*"APP_BASE_URL"/s)

  const sitesPage = read('src/client/pages/SitesPage.tsx')
  assert.doesNotMatch(sitesPage, /placeholder="위도/)
  assert.doesNotMatch(sitesPage, /placeholder="경도/)
  assert.match(sitesPage, /!form\.name \|\| !form\.address/)
  assert.match(sitesPage, /address-search\?q=/)
  assert.match(sitesPage, /주소 검색/)
})

test('AI provider page does not present subscription OAuth as a server credential', () => {
  const aiPage = read('src/client/pages/admin/AdminAiIntegrationsPage.tsx')
  const readme = read('README.md')
  assert.match(aiPage, /공식 API Key/)
  assert.match(aiPage, /ChatGPT\/Codex 구독 로그인/)
  assert.match(aiPage, /Claude Pro\/Max 구독 OAuth/)
  assert.match(aiPage, /https:\/\/platform\.openai\.com\/api-keys/)
  assert.match(aiPage, /https:\/\/platform\.claude\.com\/settings\/keys/)
  assert.match(aiPage, /href=\{API_KEY_URL\[r\.provider\]\}/)
  assert.match(aiPage, /OPENAI_MODELS/)
  assert.match(aiPage, /<select/)
  assert.match(aiPage, /\{ apiKey, model \}/)
  assert.doesNotMatch(aiPage, /\/connect\/oauth/)
  assert.match(readme, /LLM 인증 방식 \(API Key 전용\)/)
  assert.match(readme, /Codex App Server/)
  assert.match(readme, /https:\/\/platform\.openai\.com\/api-keys/)
  assert.match(readme, /https:\/\/platform\.claude\.com\/settings\/keys/)
})

test('Google site login remains environment-only and is not presented as LLM OAuth', () => {
  const app = read('src/client/App.tsx')
  const adminLayout = read('src/client/pages/admin/AdminLayout.tsx')
  const worker = read('src/worker/index.ts')
  const authRoute = read('src/worker/routes/auth.ts')
  assert.doesNotMatch(app, /AdminOAuthPage/)
  assert.doesNotMatch(adminLayout, /\/admin\/oauth/)
  assert.doesNotMatch(worker, /adminOAuthRoutes/)
  assert.doesNotMatch(authRoute, /googleOAuthConfig/)
  assert.match(authRoute, /isGoogleOAuthConfigured/)
})

test('weather and air-quality routes resolve the stored site by siteId', () => {
  const weatherRoute = read('src/worker/routes/weather.ts')
  assert.match(weatherRoute, /SiteRepository/)
  assert.match(weatherRoute, /findById\(user\.id,\s*siteId\)/)
  assert.doesNotMatch(weatherRoute, /siteFromQuery/)

  const airRoute = read('src/worker/routes/air-quality.ts')
  assert.match(airRoute, /SiteRepository/)
  assert.match(airRoute, /findById\(user\.id,\s*siteId\)/)
  assert.doesNotMatch(airRoute, /latitude:\s*0/)
})

test('VWorld address search returns normalized suggestions without exposing the API key', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    const url = new URL(String(input))
    assert.equal(url.pathname, '/req/search')
    assert.equal(url.searchParams.get('query'), '경기도 안성시 양성면')
    assert.equal(url.searchParams.get('type'), 'address')
    assert.equal(url.searchParams.get('category'), 'road')
    assert.equal(url.searchParams.get('key'), 'test-key')
    assert.equal(url.searchParams.get('domain'), 'https://construction-dashboard-2z9.pages.dev')
    return new Response(JSON.stringify({
      response: {
        status: 'OK',
        result: {
          items: [{
            title: '<b>안성</b> 주소',
            address: { road: '경기도 안성시 양성면 안성맞춤대로 1', parcel: '경기도 안성시 양성면 동항리 1' },
            point: { x: '127.2', y: '37.1' },
          }],
        },
      },
    }))
  }
  try {
    const results = await new VWorldGeocodingProvider('test-key', 'https://construction-dashboard-2z9.pages.dev').search('경기도 안성시 양성면')
    assert.deepEqual(results, [{
      address: '경기도 안성시 양성면 안성맞춤대로 1',
      roadAddress: '경기도 안성시 양성면 안성맞춤대로 1',
      parcelAddress: '경기도 안성시 양성면 동항리 1',
    }])
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld geocoding sends the registered domain and preserves safe API errors', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('domain'), 'https://construction-dashboard-2z9.pages.dev')
    return new Response(JSON.stringify({
      response: {
        status: 'ERROR',
        error: { code: 'INVALID_DOMAIN', text: 'upstream detail must not be exposed' },
      },
    }))
  }
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('test-key', 'https://construction-dashboard-2z9.pages.dev').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.match(error.message, /등록된 서비스 URL/)
        assert.doesNotMatch(error.message, /upstream detail/)
        return true
      },
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld geocoding retries one transient 5xx response and uses the succeeding response', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const status of [502, 503, 504]) {
      let calls = 0
      globalThis.fetch = async () => {
        calls += 1
        return calls === 1
          ? new Response('temporary upstream failure', { status })
          : new Response(JSON.stringify({
            response: { status: 'OK', result: { point: { x: '126.9779', y: '37.5663' } } },
          }))
      }
      assert.deepEqual(
        await new VWorldGeocodingProvider('test-key').geocode('서울특별시 중구 태평로1가'),
        { latitude: 37.5663, longitude: 126.9779 },
      )
      assert.equal(calls, 2)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld invalid-key errors never expose upstream details or the submitted key', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: {
      status: 'ERROR',
      error: { code: 'INVALID_KEY', text: 'secret-key-should-not-leak' },
    },
  }))
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('secret-key-should-not-leak').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.match(error.message, /인증키가 유효하지 않습니다/)
        assert.doesNotMatch(error.message, /secret-key-should-not-leak/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld maps a structured domain error even when the HTTP status is not successful', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: { status: 'ERROR', error: { code: 'INVALID_DOMAIN', text: 'internal upstream detail' } },
  }), { status: 403 })
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('test-key').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.match(error.message, /등록된 서비스 URL/)
        assert.doesNotMatch(error.message, /internal upstream detail/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld errors expose only an allowlisted diagnostic code', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: { status: 'ERROR', error: { code: 'SYSTEM_ERROR', text: 'internal upstream detail' } },
  }))
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('secret-key-should-not-leak').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.match(error.message, /SYSTEM_ERROR/)
        assert.doesNotMatch(error.message, /internal upstream detail/)
        assert.doesNotMatch(error.message, /secret-key-should-not-leak/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld errors never expose an API key echoed as the error code', async () => {
  const originalFetch = globalThis.fetch
  const submittedValue = 'UPSTREAM-ECHO-TEST'
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: { status: 'ERROR', error: { code: submittedValue, text: 'internal upstream detail' } },
  }))
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider(submittedValue).geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.doesNotMatch(error.message, new RegExp(submittedValue))
        assert.doesNotMatch(error.message, /internal upstream detail/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld errors do not expose a non-allowlisted error code', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: { status: 'ERROR', error: { code: 'UPSTREAM_TIMEOUT-42', text: 'internal upstream detail' } },
  }))
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('test-key').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.doesNotMatch(error.message, /UPSTREAM_TIMEOUT-42/)
        assert.doesNotMatch(error.message, /internal upstream detail/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('VWorld non-JSON HTTP errors expose only the HTTP status', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('upstream body must not be exposed', { status: 502 })
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('secret-key-should-not-leak').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.match(error.message, /HTTP 502/)
        assert.doesNotMatch(error.message, /upstream body/)
        assert.doesNotMatch(error.message, /secret-key-should-not-leak/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('site address autocomplete is exposed through the authenticated sites API and debounced in the UI', () => {
  const sitesRoute = read('src/worker/routes/sites.ts')
  const sitesPage = read('src/client/pages/SitesPage.tsx')
  assert.match(sitesRoute, /app\.get\('\/address-search'/)
  assert.match(sitesRoute, /query\.length < 2/)
  assert.match(sitesRoute, /VWorld API Key를 먼저 설정/)
  assert.match(sitesRoute, /503/)
  assert.match(sitesPage, /\/api\/sites\/address-search\?q=/)
  assert.match(sitesPage, /setTimeout/)
  assert.match(sitesPage, /<datalist/)
  assert.match(sitesPage, /addressSearchError/)
})

test('address search is cached and rate limited per approved user', async () => {
  const sitesRoute = read('src/worker/routes/sites.ts')
  assert.match(sitesRoute, /withCache/)
  assert.match(sitesRoute, /consumeFixedWindow/)

  const db = {
    prepare(sql) {
      assert.match(sql, /ON CONFLICT/)
      assert.match(sql, /RETURNING value/)
      return {
        bind(key, _now, windowSeconds, repeatedWindowSeconds, whereWindowSeconds, limit) {
          assert.match(key, /^address_search_rate:/)
          assert.equal(windowSeconds, 60)
          assert.equal(repeatedWindowSeconds, 60)
          assert.equal(whereWindowSeconds, 60)
          assert.equal(limit, 30)
          assert.match(sql, /WHERE.*value AS INTEGER.*< \?/s)
          return { first: async () => ({ value: '31' }) }
        },
      }
    },
  }
  assert.equal(await new SettingsRepository(db).consumeFixedWindow('address_search_rate:user-1', 30, 60), false)
})

test('settings repository preserves its existing get, set, and delete contract', async () => {
  const calls = []
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args })
          return {
            first: async () => ({ value: 'saved' }),
            run: async () => ({}),
          }
        },
      }
    },
  }
  const settings = new SettingsRepository(db)
  assert.equal(await settings.get('key'), 'saved')
  await settings.set('key', 'next')
  await settings.delete('key')
  assert.equal(calls.length, 3)
})

test('address search cache reuses fresh values and exposes expired values only as stale', async () => {
  const freshKey = `address-cache-fresh-${Date.now()}`
  cacheSet(freshKey, ['cached'], 60_000)
  assert.deepEqual(cacheGet(freshKey), ['cached'])
  assert.deepEqual(await withCache(freshKey, 60_000, async () => ['network']), { value: ['cached'], cached: true })

  const newKey = `address-cache-new-${Date.now()}`
  assert.deepEqual(await withCache(newKey, 60_000, async () => ['network']), { value: ['network'], cached: false })

  const staleKey = `address-cache-stale-${Date.now()}`
  cacheSet(staleKey, ['old'], -1)
  assert.equal(cacheGet(staleKey), undefined)
  assert.deepEqual(cacheGetStale(staleKey), { value: ['old'], isStale: true })

  const boundedPrefix = `address-cache-bounded-${Date.now()}`
  for (let index = 0; index < 600; index += 1) cacheSet(`${boundedPrefix}-${index}`, index, 60_000)
  assert.equal(cacheGet(`${boundedPrefix}-0`), undefined)
  assert.equal(cacheGet(`${boundedPrefix}-599`), 599)
})

test('legacy Google OAuth credentials are removed by migration', () => {
  const migration = read('migrations/0002_remove_legacy_google_oauth.sql')
  assert.match(migration, /DELETE FROM integrations/)
  assert.match(migration, /google_oauth/)
  assert.match(migration, /google_oauth_candidate/)
})

test('public API providers use their current authentication contracts', () => {
  const adminRoute = read('src/worker/routes/admin/integrations.ts')
  const kma = read('src/worker/providers/weather/KmaWeatherProvider.ts')
  const airKorea = read('src/worker/providers/air-quality/AirKoreaProvider.ts')
  const g2b = read('src/worker/providers/bidding/G2bBidProvider.ts')
  const opinet = read('src/worker/providers/oil/OpinetOilPriceProvider.ts')

  assert.match(kma, /normalizeDataGoKrServiceKey/)
  assert.match(airKorea, /normalizeDataGoKrServiceKey/)
  assert.match(airKorea, /getCtprvnRltmMesureDnsty/)
  assert.doesNotMatch(airKorea, /tmX.*longitude|tmY.*latitude/s)
  assert.doesNotMatch(airKorea, /find\(.*stationName.*\)\s*\?\?\s*items\[0\]/s)
  assert.match(g2b, /normalizeDataGoKrServiceKey/)
  assert.match(g2b, /resultCode\s*!==\s*'00'/)
  assert.match(opinet, /searchParams\.set\('certkey'/)
  assert.doesNotMatch(opinet, /searchParams\.set\('code'/)
  assert.doesNotMatch(adminRoute, /naver|Naver|NAVER/)
})

test('ECOS requests the daily cycle and accepts a valid StatisticSearch rate', async () => {
  const originalFetch = globalThis.fetch
  let cycle
  globalThis.fetch = async (input) => {
    const parts = new URL(String(input)).pathname.split('/')
    cycle = parts[9]
    return new Response(JSON.stringify({
      StatisticSearch: { row: [{ TIME: '20260908', DATA_VALUE: '1388.70' }] },
    }))
  }
  try {
    const [usd] = await new EcosExchangeRateProvider('test-key').getRates(['USD'])
    assert.equal(cycle, 'D')
    assert.equal(usd.rate, 1388.7)
    assert.equal(usd.pairLabel, 'USD/KRW')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Opinet connection rejects empty upstream data with a safe approval hint', async () => {
  const originalFetch = globalThis.fetch
  const submittedKey = 'submitted-key-must-not-leak'
  const upstreamBody = 'upstream-body-must-not-leak'
  globalThis.fetch = async () => new Response(JSON.stringify({ RESULT: { OIL: [], detail: upstreamBody } }), { status: 200 })
  try {
    const response = await adminIntegrations.request('https://dashboard.example.com/opinet/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: { apiKey: submittedKey } }),
    })
    const body = await response.json()
    assert.equal(response.status, 400)
    assert.equal(body.message, 'Opinet API 응답에 데이터가 없습니다. API 키가 유효하지 않거나 활용신청 승인이 되지 않았을 수 있습니다.')
    assert.doesNotMatch(body.message, new RegExp(submittedKey))
    assert.doesNotMatch(body.message, new RegExp(upstreamBody))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Opinet connection treats only an explicit empty OIL list as an approval hint', async () => {
  const originalFetch = globalThis.fetch
  const submittedKey = 'submitted-key-must-not-leak'
  const upstreamBody = 'upstream-body-must-not-leak'
  const genericMessage = 'Opinet API 연결 확인에 실패했습니다. API 키와 해당 서비스의 활용신청 승인 상태를 확인해 주세요'
  try {
    for (const payload of [{}, { RESULT: {} }, { RESULT: { OIL: null } }]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ ...payload, detail: upstreamBody }), { status: 200 })
      const response = await adminIntegrations.request('https://dashboard.example.com/opinet/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: { apiKey: submittedKey } }),
      })
      const body = await response.json()
      assert.equal(response.status, 400)
      assert.equal(body.message, genericMessage)
      assert.doesNotMatch(body.message, new RegExp(submittedKey))
      assert.doesNotMatch(body.message, new RegExp(upstreamBody))
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Opinet connection keeps a non-empty list without diesel on the generic failure message', async () => {
  const originalFetch = globalThis.fetch
  const submittedKey = 'submitted-key-must-not-leak'
  const upstreamBody = 'upstream-body-must-not-leak'
  globalThis.fetch = async () => new Response(JSON.stringify({
    RESULT: { OIL: [{ PRODCD: 'B027' }], detail: upstreamBody },
  }), { status: 200 })
  try {
    const response = await adminIntegrations.request('https://dashboard.example.com/opinet/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: { apiKey: submittedKey } }),
    })
    const body = await response.json()
    assert.equal(response.status, 400)
    assert.equal(body.message, 'Opinet API 연결 확인에 실패했습니다. API 키와 해당 서비스의 활용신청 승인 상태를 확인해 주세요')
    assert.doesNotMatch(body.message, new RegExp(submittedKey))
    assert.doesNotMatch(body.message, new RegExp(upstreamBody))
  } finally {
    globalThis.fetch = originalFetch
  }
})
