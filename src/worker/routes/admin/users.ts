import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { UserRepository } from '../../repositories/UserRepository'
import { toPublicUser } from '../../../shared/types/user'
import { ok, fail } from '../../../shared/types/common'

const app = new Hono<AppEnv>()

// GET /api/admin/users?status=PENDING (미지정 시 전체)
app.get('/', async (c) => {
  const status = c.req.query('status') as any
  const repo = new UserRepository(c.env.DB)
  const users = status ? await repo.listByStatus(status) : await repo.listAll()
  return c.json(ok(users.map(toPublicUser), 'live'))
})

// POST /api/admin/users/:id/approve
app.post('/:id/approve', async (c) => {
  const admin = c.get('currentUser')!
  const id = c.req.param('id')
  const repo = new UserRepository(c.env.DB)
  await repo.approve(id, admin.id)
  return c.json(ok({ id, status: 'APPROVED' }, 'live'))
})

// POST /api/admin/users/:id/reject
app.post('/:id/reject', async (c) => {
  const admin = c.get('currentUser')!
  const id = c.req.param('id')
  const repo = new UserRepository(c.env.DB)
  await repo.reject(id, admin.id)
  return c.json(ok({ id, status: 'REJECTED' }, 'live'))
})

// POST /api/admin/users/:id/suspend
app.post('/:id/suspend', async (c) => {
  const id = c.req.param('id')
  const repo = new UserRepository(c.env.DB)
  await repo.suspend(id)
  return c.json(ok({ id, status: 'SUSPENDED' }, 'live'))
})

// POST /api/admin/users/:id/revoke - 승인 취소 (APPROVED -> PENDING)
app.post('/:id/revoke', async (c) => {
  const id = c.req.param('id')
  const repo = new UserRepository(c.env.DB)
  await repo.revokeApproval(id)
  return c.json(ok({ id, status: 'PENDING' }, 'live'))
})

// POST /api/admin/users/:id/role  body: { role: 'ADMIN'|'USER' }
app.post('/:id/role', async (c) => {
  const admin = c.get('currentUser')!
  const id = c.req.param('id')
  const { role } = await c.req.json()
  if (role !== 'ADMIN' && role !== 'USER') return c.json(fail('유효하지 않은 role', 'live'), 400)
  // 마지막 ADMIN을 본인이 스스로 USER로 강등하는 것을 방지 (관리자 0명 상태 방지)
  const repo = new UserRepository(c.env.DB)
  if (id === admin.id && role === 'USER') {
    const adminCount = await repo.countAdmins()
    if (adminCount <= 1) return c.json(fail('마지막 관리자는 권한을 변경할 수 없습니다', 'live'), 400)
  }
  await repo.changeRole(id, role)
  return c.json(ok({ id, role }, 'live'))
})

export default app
