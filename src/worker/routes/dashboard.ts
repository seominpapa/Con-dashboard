import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { DashboardConfigRepository } from '../repositories/DashboardConfigRepository'
import { ok } from '../../shared/types/common'

const app = new Hono<AppEnv>()

// GET /api/dashboard/config - 로그인 사용자의 서버 동기화 Dashboard 구성 조회
// MVP 기본 저장소는 클라이언트 localStorage이지만, 로그인 사용자는 D1에도 동기화하여
// AI Briefing이 사용자의 현재 Widget 구성을 알 수 있게 한다 (기획 39번).
app.get('/config', async (c) => {
  const user = c.get('currentUser')!
  const repo = new DashboardConfigRepository(c.env.DB)
  const config = await repo.get(user.id)
  return c.json(ok(config, 'live'))
})

app.put('/config', async (c) => {
  const user = c.get('currentUser')!
  const body = await c.req.json()
  const repo = new DashboardConfigRepository(c.env.DB)
  await repo.save(user.id, body)
  return c.json(ok({ saved: true }, 'live'))
})

export default app
