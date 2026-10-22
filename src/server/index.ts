import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createNodeApp } from './app'
import { readConfig } from './config'
import { openSqliteDatabase } from './sqlite'

const config = readConfig(process.env)
const database = openSqliteDatabase(config.databasePath, fileURLToPath(new URL('../../migrations/', import.meta.url)))
const app = createNodeApp({ ...config.bindings, DB: database.db }, fileURLToPath(new URL('../', import.meta.url)))
const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
  console.log(`Dashboard listening on ${config.host}:${config.port}`)
})
server.on('error', () => {
  database.close()
  console.error('Dashboard HTTP server failed to start')
  process.exitCode = 1
})

function shutdown() {
  if (!server.listening) return
  const timeout = setTimeout(() => {
    console.error('Dashboard shutdown timed out')
    process.exit(1)
  }, 10_000)
  timeout.unref()
  server.close(() => {
    clearTimeout(timeout)
    database.close()
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
