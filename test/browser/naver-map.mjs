// Run with a local Vite server and PLAYWRIGHT_MODULE pointing to the installed Playwright entry.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(10000)
const base = process.env.BASE_URL || 'http://127.0.0.1:5177'
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const sites = [{ id: 'one', name: '테스트 현장 A', latitude: 37.5, longitude: 127 }, { id: 'two', name: '테스트 현장 B', latitude: 36.5, longitude: 128 }]
let registered = false
let sdkLoads = 0
let authOnLoad = false
const envelope = (data) => ({ status: 'success', data, source: 'live', updatedAt: new Date().toISOString() })
await page.addInitScript(() => localStorage.setItem('construction-dashboard:config:v1', JSON.stringify({ desktopOrder: [], mobileOrder: [], activeSiteId: 'one' })))
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url())
  let data = {}
  if (url.pathname === '/api/auth/me') data = { id: 'admin', name: '관리자', role: 'ADMIN', status: 'APPROVED' }
  else if (url.pathname === '/api/auth/config') data = { googleEnabled: false }
  else if (url.pathname === '/api/sites') data = sites
  else if (url.pathname === '/api/admin/integrations') data = [{ provider: 'naver_dynamic_map', label: 'NAVER Dynamic Map', status: registered ? 'CONNECTED' : 'DISCONNECTED', dbConfigured: registered, expiresAt: null, daysUntilExpiry: null, noExpiry: false, memo: '' }]
  else if (url.pathname.endsWith('/naver_dynamic_map/connect')) {
    assert.deepEqual(route.request().postDataJSON().credential, { clientId: 'public123' })
    registered = true
    data = { testResult: { ok: true, message: 'ID 형식 확인 완료 · 브라우저 인증 확인 필요' } }
  } else if (url.pathname === '/api/naver-map') data = { clientId: 'public123', site: sites.find((site) => site.id === url.searchParams.get('siteId')) }
  await route.fulfill({ json: envelope(data) })
})
await page.route('https://oapi.map.naver.com/**', async (route) => {
  sdkLoads++
  const url = new URL(route.request().url())
  assert.equal(url.searchParams.get('ncpKeyId'), 'public123')
  await route.fulfill({ contentType: 'application/javascript', body: `
    window.mapCalls = [];
    window.naver = { maps: {
      LatLng: class { constructor(lat,lng){this.lat=lat;this.lng=lng} },
      Map: class { constructor(el,options){this.el=el;window.mapCalls.push(['map',options.center.lat]);el.textContent='테스트 지도';el.style.background='#e2e8f0'} setCenter(){window.mapCalls.push(['center'])} autoResize(){} destroy(){window.mapCalls.push(['destroy']);this.el.replaceChildren()} },
      Marker: class {setMap(){}},
      TrafficLayer: class {constructor(options){window.mapCalls.push(['interval',options.interval])}setMap(){}refreshRTSVersion(){window.mapCalls.push(['version'])}refresh(){window.mapCalls.push(['refresh'])}endAutoRefresh(){window.mapCalls.push(['stop'])}}
    }};
    window[${JSON.stringify(url.searchParams.get('callback'))}]();
    ${authOnLoad ? 'window.navermap_authFailure();' : ''}
  ` })
})
try {
  await page.goto(`${base}/admin/integrations`)
  await page.getByRole('button', { name: '연결하기', exact: true }).click()
  const dialog = page.locator('.fixed.inset-0')
  assert.equal(await dialog.locator('input[type="password"]').count(), 0)
  await dialog.getByLabel('API Key ID (Client ID)', { exact: true }).fill('public123')
  await dialog.getByRole('button', { name: '지도 ID 저장' }).click()
  await page.getByText('등록됨 · 지도에서 인증 확인 필요', { exact: false }).waitFor()
  await page.getByRole('link', { name: '건설 Dashboard' }).click()
  await page.getByRole('button', { name: '위젯 추가', exact: true }).click()
  await page.locator('.fixed.inset-0').getByRole('button', { name: /현장 교통지도/ }).click()
  await page.getByRole('region', { name: '테스트 현장 A 교통지도' }).waitFor()
  await page.getByRole('button', { name: '새로고침', exact: true }).click()
  await page.getByText('교통정보 갱신을 요청했습니다.', { exact: false }).waitFor()
  await page.getByRole('button', { name: '현장으로', exact: true }).click()
  await page.getByRole('button', { name: '테스트 현장 A', exact: true }).click()
  await page.getByRole('button', { name: '테스트 현장 B', exact: true }).click()
  await page.getByRole('region', { name: '테스트 현장 B 교통지도' }).waitFor()
  assert.equal(sdkLoads, 1)
  assert.ok(await page.evaluate(() => window.mapCalls.some(([event]) => event === 'stop')))
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.evaluate(() => window.navermap_authFailure())
  await page.getByRole('alert').filter({ hasText: '지도 인증에 실패' }).waitFor()
  assert.equal(await page.getByRole('region', { name: '테스트 현장 B 교통지도' }).isVisible(), false)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByText('현장 교통지도', { exact: true }).hover()
  await page.getByRole('button', { name: '위젯 숨기기', exact: true }).click()
  await page.getByText('표시할 위젯이 없습니다.', { exact: true }).waitFor()
  authOnLoad = true
  await page.reload()
  await page.getByRole('button', { name: '위젯 추가', exact: true }).click()
  await page.locator('.fixed.inset-0').getByRole('button', { name: /현장 교통지도/ }).click()
  await page.getByRole('alert').filter({ hasText: '지도 인증에 실패' }).waitFor()
  assert.equal(await page.evaluate(() => window.mapCalls.filter(([event]) => event === 'map').length), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: admin ID-only registration → picker → map → refresh/recenter → site switch → mobile → auth failure → hide; mocked SDK/API only')
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 5000))
  throw error
} finally { await browser.close() }
