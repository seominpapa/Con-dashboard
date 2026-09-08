import { Hono } from 'hono'
import type { AppEnv } from './env'
import { attachUser, requireApproved, requireAdmin, requireSameOriginMutation } from './middleware/auth'

import authRoutes from './routes/auth'
import weatherRoutes from './routes/weather'
import airQualityRoutes from './routes/air-quality'
import biddingRoutes from './routes/bidding'
import newsRoutes from './routes/news'
import lawsRoutes from './routes/laws'
import exchangeRatesRoutes from './routes/exchange-rates'
import oilPricesRoutes from './routes/oil-prices'
import materialPricesRoutes from './routes/material-prices'
import siteSummaryRoutes from './routes/site-summary'
import schedulesRoutes from './routes/schedules'
import todosRoutes from './routes/todos'
import sitesRoutes from './routes/sites'
import dashboardRoutes from './routes/dashboard'
import briefingRoutes from './routes/briefing'
import trafficRoutes from './routes/traffic'

import adminUsersRoutes from './routes/admin/users'
import adminIntegrationsRoutes from './routes/admin/integrations'
import adminIntegrationsAiRoutes from './routes/admin/integrations-ai'

const app = new Hono<AppEnv>()

// 모든 요청에 currentUser를 주입 (세션 쿠키 검증) - 기획 31번 서버 미들웨어 계층
app.use('*', attachUser)
app.use('/api/*', requireSameOriginMutation)

// ---- 인증 (로그인 불필요) ----
app.route('/api/auth', authRoutes)

// ---- 승인된 사용자만 접근 가능한 공개데이터/업무 API ----
const api = new Hono<AppEnv>()
api.use('*', requireApproved)
api.route('/weather', weatherRoutes)
api.route('/air-quality', airQualityRoutes)
api.route('/bids', biddingRoutes)
api.route('/news', newsRoutes)
api.route('/laws', lawsRoutes)
api.route('/exchange-rates', exchangeRatesRoutes)
api.route('/oil-prices', oilPricesRoutes)
api.route('/material-prices', materialPricesRoutes)
api.route('/site-summary', siteSummaryRoutes)
api.route('/schedules', schedulesRoutes)
api.route('/todos', todosRoutes)
api.route('/sites', sitesRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/briefing', briefingRoutes)
api.route('/traffic', trafficRoutes)
app.route('/api', api)

// ---- 관리자 전용 ----
const admin = new Hono<AppEnv>()
admin.use('*', requireAdmin)
admin.route('/users', adminUsersRoutes)
admin.route('/integrations', adminIntegrationsRoutes)
admin.route('/integrations/ai', adminIntegrationsAiRoutes)
app.route('/api/admin', admin)

// ---- API 404 ----
// 정적 자산(SPA index.html 포함)은 Cloudflare Pages가 이 Worker보다 먼저
// dist/ 산출물에서 매칭을 시도하므로, 여기까지 도달하는 요청은 매칭되는
// 정적 파일이 없는 경우다. /api/* 만 404 JSON으로 명확히 응답하고,
// 그 외(SPA client-side 라우트 직접 진입 등)는 Pages 설정의
// _routes.json / SPA fallback이 처리하도록 그대로 통과시킨다.
app.get('/api/*', (c) => c.json({ status: 'error', message: 'Not Found' }, 404))

export default app
