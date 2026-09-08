import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { NaverMapsGeocodingProvider } from '../src/worker/providers/geocoding/NaverMapsGeocodingProvider.ts'
import { cacheGet, cacheGetStale, cacheSet, withCache } from '../src/worker/cache/memoryCache.ts'
import { SettingsRepository } from '../src/worker/repositories/SettingsRepository.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { EcosExchangeRateProvider } = await vite.ssrLoadModule('/src/worker/providers/exchange/EcosExchangeRateProvider.ts')
const { default: adminIntegrations } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
after(() => vite.close())

test('Naver Maps geocoding replaces VWorld in site creation and admin integration metadata', () => {
  assert.equal(existsSync(new URL('../src/worker/providers/geocoding/NaverMapsGeocodingProvider.ts', import.meta.url)), true)

  const integrationTypes = read('src/shared/types/integration.ts')
  assert.match(integrationTypes, /'naver_maps'/)
  assert.match(integrationTypes, /NAVER_MAP_CLIENT_ID/)
  assert.match(integrationTypes, /NAVER_MAP_CLIENT_SECRET/)
  assert.doesNotMatch(integrationTypes, /'vworld'|VWORLD_API_KEY/)

  const credentials = read('src/worker/integrations/publicCredentials.ts')
  assert.match(credentials, /naver_maps:\s*\['clientId',\s*'clientSecret'\]/)
  assert.doesNotMatch(credentials, /vworld|VWORLD/)

  const sitesRoute = read('src/worker/routes/sites.ts')
  const adminIntegrationsRoute = read('src/worker/routes/admin/integrations.ts')
  const workerEnv = read('src/worker/env.ts')
  const envExample = read('.env.example')
  assert.match(workerEnv, /NAVER_MAP_CLIENT_ID\?: string/)
  assert.match(workerEnv, /NAVER_MAP_CLIENT_SECRET\?: string/)
  assert.doesNotMatch(workerEnv, /VWORLD_API_KEY/)
  assert.match(envExample, /NAVER_MAP_CLIENT_ID=/)
  assert.match(envExample, /NAVER_MAP_CLIENT_SECRET=/)
  assert.doesNotMatch(envExample, /^NAVER_CLIENT_(?:ID|SECRET)=/m)
  assert.match(sitesRoute, /NaverMapsGeocodingProvider/)
  assert.match(sitesRoute, /geocodeSiteAddress/)
  assert.match(sitesRoute, /if \(!credential\) throw new NaverMapsApiError/)
  assert.match(sitesRoute, /app\.get\('\/address-search'/)
  assert.doesNotMatch(sitesRoute, /위도\/경도가 필요합니다/)
  assert.match(sitesRoute, /latLonToKmaGrid\(coords\.latitude,\s*coords\.longitude\)/)
  assert.match(sitesRoute, /MAX_ADDRESS_LENGTH/)
  assert.match(sitesRoute, /body\.address !== existing\.address/)
  assert.match(sitesRoute, /err instanceof NaverMapsApiError/)
  assert.match(adminIntegrationsRoute, /case 'naver_maps'/)
  assert.match(adminIntegrationsRoute, /NAVER_MAP_CLIENT_ID/)
  assert.match(adminIntegrationsRoute, /NAVER_MAP_CLIENT_SECRET/)
  assert.doesNotMatch(adminIntegrationsRoute, /vworld|VWorld|VWORLD/)

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

test('Naver Maps address search sends headers and normalizes suggestions', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input, init) => {
    calls += 1
    const url = new URL(String(input))
    assert.equal(url.pathname, '/map-geocode/v2/geocode')
    assert.equal(url.searchParams.get('query'), '경기도 안성시 양성면')
    assert.equal(url.searchParams.has('clientId'), false)
    assert.equal(url.searchParams.has('clientSecret'), false)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('x-ncp-apigw-api-key-id'), 'test-client-id')
    assert.equal(headers.get('x-ncp-apigw-api-key'), 'test-client-secret')
    return new Response(JSON.stringify({
      status: 'OK',
      addresses: [{
        roadAddress: '경기도 안성시 양성면 안성맞춤대로 1',
        jibunAddress: '경기도 안성시 양성면 동항리 1',
        x: '127.2',
        y: '37.1',
      }],
    }))
  }
  try {
    const results = await new NaverMapsGeocodingProvider('test-client-id', 'test-client-secret').search('경기도 안성시 양성면')
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

test('Naver Maps geocoding normalizes coordinates and keeps credentials out of the URL', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/map-geocode/v2/geocode')
    assert.equal(url.searchParams.get('query'), '서울특별시 중구 태평로1가')
    assert.equal(url.searchParams.has('clientId'), false)
    assert.equal(url.searchParams.has('clientSecret'), false)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('x-ncp-apigw-api-key-id'), 'test-client-id')
    assert.equal(headers.get('x-ncp-apigw-api-key'), 'test-client-secret')
    return new Response(JSON.stringify({
      status: 'OK',
      addresses: [{ roadAddress: '서울특별시 중구 세종대로 110', jibunAddress: '서울특별시 중구 태평로1가', x: '126.9779', y: '37.5663' }],
    }))
  }
  try {
    assert.deepEqual(
      await new NaverMapsGeocodingProvider('test-client-id', 'test-client-secret').geocode('서울특별시 중구 태평로1가'),
      { latitude: 37.5663, longitude: 126.9779 },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Naver Maps rejects blank credentials before making a request', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ status: 'OK', addresses: [] }))
  }
  try {
    await assert.rejects(
      () => new NaverMapsGeocodingProvider(' ', ' ').geocode('서울시청'),
      /인증 정보/,
    )
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Naver Maps retries transient errors and never exposes credentials or upstream details', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  const signals = []
  globalThis.fetch = async (_input, init) => {
    calls += 1
    signals.push(init?.signal)
    if (calls === 1) return new Response('temporary internal detail', { status: 503 })
    return new Response(JSON.stringify({ error: 'secret-value upstream detail' }), { status: 401 })
  }
  try {
    await assert.rejects(
      () => new NaverMapsGeocodingProvider('client-id', 'secret-value').geocode('서울시청'),
      (error) => {
        assert.match(error.message, /인증 정보/)
        assert.doesNotMatch(error.message, /secret-value|upstream detail/)
        return true
      },
    )
    assert.equal(calls, 2)
    assert.notEqual(signals[0], signals[1])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('site address autocomplete is exposed through the authenticated sites API and debounced in the UI', () => {
  const sitesRoute = read('src/worker/routes/sites.ts')
  const sitesPage = read('src/client/pages/SitesPage.tsx')
  assert.match(sitesRoute, /app\.get\('\/address-search'/)
  assert.match(sitesRoute, /query\.length < 2/)
  assert.match(sitesRoute, /NAVER Cloud Maps 인증 정보를 먼저 설정/)
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
  assert.match(sitesRoute, /site_geocode_rate:/)
  assert.equal((sitesRoute.match(/consumeSiteGeocode\(c\.env, user\.id\)/g) ?? []).length, 2)

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

  assert.match(kma, /normalizeDataGoKrServiceKey/)
  assert.match(airKorea, /normalizeDataGoKrServiceKey/)
  assert.match(airKorea, /getCtprvnRltmMesureDnsty/)
  assert.doesNotMatch(airKorea, /tmX.*longitude|tmY.*latitude/s)
  assert.doesNotMatch(airKorea, /find\(.*stationName.*\)\s*\?\?\s*items\[0\]/s)
  assert.match(g2b, /normalizeDataGoKrServiceKey/)
  assert.match(g2b, /resultCode\s*!==\s*'00'/)
  assert.doesNotMatch(adminRoute, /case 'naver':/)
})

test('obsolete VWorld credentials are removed instead of being reused as Naver credentials', () => {
  const migration = read('migrations/0004_remove_vworld.sql')
  const deploy = read('.github/workflows/deploy.yml')
  assert.match(migration, /DELETE FROM integrations WHERE provider = 'vworld'/)
  assert.doesNotMatch(migration, /UPDATE integrations/)
  assert.match(deploy, /d1 migrations apply construction-dashboard-production --remote/)
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
