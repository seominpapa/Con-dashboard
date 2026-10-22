import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import worker from '../worker/index'
import type { Bindings } from '../worker/env'

export function createNodeApp(bindings: Bindings, staticRoot: string) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    try {
      const path = decodeURIComponent(c.req.path)
      const segments = path.split('/')
      if (path.includes('\\') || path.includes('%') || segments.some((part) => part.startsWith('.') || part.startsWith('_')) ||
        ['server', 'migrations', 'data'].includes(segments[1])) return c.notFound()
    } catch {
      return c.notFound()
    }
    return next()
  })
  app.get('/healthz', async (c) => {
    try {
      await bindings.DB.prepare('SELECT 1 AS ready').first()
      return c.json({ status: 'ok' })
    } catch {
      return c.json({ status: 'unavailable' }, 503)
    }
  })
  const api = (request: Request) => worker.fetch(request, bindings)
  app.all('/api', (c) => api(c.req.raw))
  app.all('/api/*', (c) => api(c.req.raw))
  app.use('/assets/*', serveStatic({ root: staticRoot }))
  app.use('/static/*', serveStatic({ root: staticRoot }))
  app.use('/favicon.ico', serveStatic({ root: staticRoot }))
  const index = serveStatic({ root: staticRoot, path: 'index.html' })
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/assets/') || c.req.path.startsWith('/static/') || decodeURIComponent(c.req.path).includes('.')) return c.notFound()
    return (await index(c, next)) ?? c.notFound()
  })
  return app
}
