import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { getOrCreateTodayBriefing } from '../briefing/BriefingService'

const app = new Hono<AppEnv>()

// GET /api/briefing/today
// 기획 41~43번: 사용자별 하루 1회만 생성, 첫 로그인 이후 아무 때나 호출해도
// 캐시된(DB저장) 오늘자 브리핑을 반환한다. 이 라우트 자체는 절대 throw 하지 않는다
// (BriefingService 내부에서 모든 실패를 unavailable/error 상태로 흡수함).
app.get('/today', async (c) => {
  const user = c.get('currentUser')!
  const result = await getOrCreateTodayBriefing(c.env, { userId: user.id, userName: user.name })
  return c.json({ status: 'success', data: result })
})

export default app
