import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

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
  assert.match(sitesRoute, /VWorldGeocodingProvider/)
  assert.match(sitesRoute, /geocodeSiteAddress/)
  assert.doesNotMatch(sitesRoute, /위도\/경도가 필요합니다/)
  assert.match(sitesRoute, /latLonToKmaGrid\(coords\.latitude,\s*coords\.longitude\)/)
  assert.match(sitesRoute, /MAX_ADDRESS_LENGTH/)
  assert.match(sitesRoute, /body\.address !== existing\.address/)

  const sitesPage = read('src/client/pages/SitesPage.tsx')
  assert.doesNotMatch(sitesPage, /placeholder="위도/)
  assert.doesNotMatch(sitesPage, /placeholder="경도/)
  assert.match(sitesPage, /!form\.name \|\| !form\.address/)
})

test('OAuth settings expose both verification and login callback URLs', () => {
  const oauthRoute = read('src/worker/routes/admin/oauth.ts')
  const oauthPage = read('src/client/pages/admin/AdminOAuthPage.tsx')
  assert.match(oauthRoute, /verificationCallbackUrl/)
  assert.match(oauthRoute, /loginCallbackUrl/)
  assert.match(oauthPage, /verificationCallbackUrl/)
  assert.match(oauthPage, /loginCallbackUrl/)
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
