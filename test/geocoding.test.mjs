import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { VWorldGeocodingProvider } from '../src/worker/providers/geocoding/VWorldGeocodingProvider.ts'
import { cacheGet, cacheGetStale, cacheSet, withCache } from '../src/worker/cache/memoryCache.ts'
import { SettingsRepository } from '../src/worker/repositories/SettingsRepository.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

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
  assert.match(wranglerConfig, /"APP_BASE_URL": "https:\/\/construction-dashboard-2z9\.pages\.dev"/)

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

test('VWorld unknown API errors use a safe fallback message', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    response: { status: 'ERROR', error: { code: 'UNKNOWN', text: 'internal upstream detail' } },
  }))
  try {
    await assert.rejects(
      () => new VWorldGeocodingProvider('test-key').geocode('서울특별시 중구 태평로1가'),
      (error) => {
        assert.equal(error.message, 'VWorld 주소 좌표 변환에 실패했습니다')
        assert.doesNotMatch(error.message, /internal upstream detail/)
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
  assert.equal(cacheGetStale(staleKey), undefined)

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
  const naver = read('src/worker/providers/news/NaverNewsProvider.ts')

  assert.match(kma, /normalizeDataGoKrServiceKey/)
  assert.match(airKorea, /normalizeDataGoKrServiceKey/)
  assert.match(airKorea, /getCtprvnRltmMesureDnsty/)
  assert.doesNotMatch(airKorea, /tmX.*longitude|tmY.*latitude/s)
  assert.doesNotMatch(airKorea, /find\(.*stationName.*\)\s*\?\?\s*items\[0\]/s)
  assert.match(g2b, /normalizeDataGoKrServiceKey/)
  assert.match(g2b, /resultCode\s*!==\s*'00'/)
  assert.match(opinet, /searchParams\.set\('certkey'/)
  assert.doesNotMatch(opinet, /searchParams\.set\('code'/)
  assert.match(naver, /naverapihub\.apigw\.ntruss\.com/)
  assert.match(naver, /X-NCP-APIGW-API-KEY-ID/)
  assert.doesNotMatch(naver, /res\.status === 401 \|\| res\.status === 403/)
  assert.match(adminRoute, /credential\.apiType/)
  assert.match(adminRoute, /getNews\(\['건설정책'\],\s*1\)/)
})
