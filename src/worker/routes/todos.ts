import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { TodoRepository } from '../repositories/TodoRepository'
import { ok } from '../../shared/types/common'

const app = new Hono<AppEnv>()

app.get('/', async (c) => {
  const user = c.get('currentUser')!
  const repo = new TodoRepository(c.env.DB)
  const todos = await repo.listByUser(user.id)
  return c.json(ok(todos, 'live'))
})

app.post('/', async (c) => {
  const user = c.get('currentUser')!
  const body = await c.req.json()
  const repo = new TodoRepository(c.env.DB)
  const created = await repo.create(user.id, body)
  return c.json(ok(created, 'live'))
})

app.patch('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const body = await c.req.json()
  const repo = new TodoRepository(c.env.DB)
  await repo.update(user.id, id, body)
  return c.json(ok({ id }, 'live'))
})

app.delete('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const repo = new TodoRepository(c.env.DB)
  await repo.delete(user.id, id)
  return c.json(ok({ id }, 'live'))
})

export default app
