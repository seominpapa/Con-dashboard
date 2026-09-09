import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getAuthSecretFromEnv } from '../auth/session'
import { IntegrationRepository } from '../repositories/IntegrationRepository'
import { SiteRepository } from '../repositories/SiteRepository'
import { SettingsRepository } from '../repositories/SettingsRepository'
import { validatePublicCredential } from '../integrations/publicCredentials'
import { fail, ok } from '../../shared/types/common'

const app = new Hono<AppEnv>()

app.get('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  const user = c.get('currentUser')
  if (!user) return c.json(fail('로그인이 필요합니다', 'live'), 401)
  const siteId = c.req.query('siteId')
  if (!siteId) return c.json(fail('현장을 선택해 주세요', 'live'), 400)
  if (!await new SettingsRepository(c.env.DB).consumeFixedWindow(`naver_map_rate:${user.id}`, 60, 60)) {
    c.header('Retry-After', '60')
    return c.json(fail('지도 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', 'live'), 429)
  }
  const site = await new SiteRepository(c.env.DB).findById(user.id, siteId)
  if (!site) return c.json(fail('현장을 찾을 수 없습니다', 'live'), 404)
  if (!Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)
    || Math.abs(site.latitude) > 90 || Math.abs(site.longitude) > 180) {
    return c.json(fail('현장의 좌표가 올바르지 않습니다. 현장 주소를 다시 설정해 주세요', 'live'), 400)
  }
  try {
    const repo = new IntegrationRepository(c.env.DB, getAuthSecretFromEnv(c.env))
    const stored = await repo.getDecryptedCredential('naver_dynamic_map')
    const validation = validatePublicCredential('naver_dynamic_map', stored ?? { clientId: c.env.NAVER_DYNAMIC_MAP_CLIENT_ID })
    if (!validation.valid) return c.json(fail('관리자 패널에서 NAVER Dynamic Map Client ID를 등록해 주세요', 'live'), 503)
    // 브라우저 SDK용 공개 ID만 허용한다. Geocoding Client Secret은 읽거나 전달하지 않는다.
    return c.json(ok({ clientId: validation.credential.clientId,
      site: { id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude },
    }, 'live'))
  } catch {
    return c.json(fail('지도 설정을 읽을 수 없습니다. 관리자에게 Dynamic Map 설정 확인을 요청해 주세요', 'live'), 503)
  }
})

export default app
