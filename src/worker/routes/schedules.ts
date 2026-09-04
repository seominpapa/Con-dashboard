import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { ScheduleRepository } from '../repositories/ScheduleRepository'
import { ok, fail } from '../../shared/types/common'

const app = new Hono<AppEnv>()

// GET /api/schedules?from=..&to=..
app.get('/', async (c) => {
  const user = c.get('currentUser')!
  const from = c.req.query('from')
  const to = c.req.query('to')
  const repo = new ScheduleRepository(c.env.DB)
  const events = await repo.listByUser(user.id, from, to)
  return c.json(ok(events, 'live'))
})

// POST /api/schedules
app.post('/', async (c) => {
  const user = c.get('currentUser')!
  const body = await c.req.json()
  const repo = new ScheduleRepository(c.env.DB)
  const created = await repo.create(user.id, body)
  return c.json(ok(created, 'live'))
})

// PATCH /api/schedules/:id
app.patch('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const body = await c.req.json()
  const repo = new ScheduleRepository(c.env.DB)
  await repo.update(user.id, id, body)
  return c.json(ok({ id }, 'live'))
})

// DELETE /api/schedules/:id
app.delete('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const repo = new ScheduleRepository(c.env.DB)
  await repo.delete(user.id, id)
  return c.json(ok({ id }, 'live'))
})

export default app
