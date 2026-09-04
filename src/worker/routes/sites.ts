import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { SiteRepository } from '../repositories/SiteRepository'
import { ok, fail } from '../../shared/types/common'
import { latLonToKmaGrid } from '../../shared/utils/kmaGrid'

const app = new Hono<AppEnv>()

app.get('/', async (c) => {
  const user = c.get('currentUser')!
  const repo = new SiteRepository(c.env.DB)
  const sites = await repo.listByUser(user.id)
  return c.json(ok(sites, 'live'))
})

app.post('/', async (c) => {
  const user = c.get('currentUser')!
  const body = await c.req.json()
  if (!body.latitude || !body.longitude) {
    return c.json(fail('위도/경도가 필요합니다', 'live'), 400)
  }
  const { nx, ny } = latLonToKmaGrid(body.latitude, body.longitude)
  const repo = new SiteRepository(c.env.DB)
  const created = await repo.create(user.id, { ...body, kmaNx: nx, kmaNy: ny })
  return c.json(ok(created, 'live'))
})

app.patch('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const body = await c.req.json()
  if (body.latitude && body.longitude) {
    const { nx, ny } = latLonToKmaGrid(body.latitude, body.longitude)
    body.kmaNx = nx
    body.kmaNy = ny
  }
  const repo = new SiteRepository(c.env.DB)
  await repo.update(user.id, id, body)
  return c.json(ok({ id }, 'live'))
})

app.delete('/:id', async (c) => {
  const user = c.get('currentUser')!
  const id = c.req.param('id')
  const repo = new SiteRepository(c.env.DB)
  await repo.delete(user.id, id)
  return c.json(ok({ id }, 'live'))
})

export default app
