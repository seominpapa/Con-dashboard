import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { Hono } from 'hono'

const vite = await createServer({ appType: 'custom', logLevel: 'error' })
const { default: adminIntegrations } = await vite.ssrLoadModule('/src/worker/routes/admin/integrations.ts')
after(() => vite.close())

const dateFromToday = (days) => {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function createDatabase(rows = []) {
  const byProvider = new Map(rows.map((row) => [row.provider, { ...row }]))
  let writes = 0

  return {
    database: {
      prepare(sql) {
        const statement = {
          bind(...values) {
            return {
              async first() {
                const provider = values.at(-1)
                const row = byProvider.get(provider)
                if (sql.includes('SELECT id')) return row ? { id: row.id } : null
                if (sql.includes('SELECT encrypted_credential')) return row ? { encrypted_credential: row.encrypted_credential } : null
                return row ?? null
              },
              async run() {
                writes += 1
                if (sql.includes('INSERT INTO integrations') && sql.includes('encrypted_credential')) {
                  const [id, provider, type, encryptedCredential, metadata, connectedAt, updatedBy, updatedAt] = values
                  byProvider.set(provider, {
                    id,
                    provider,
                    type,
                    status: 'CONNECTED',
                    encrypted_credential: encryptedCredential,
                    metadata,
                    connected_at: connectedAt,
                    last_checked_at: null,
                    last_success_at: null,
                    last_error: null,
                    updated_by: updatedBy,
                    updated_at: updatedAt,
                  })
                } else if (sql.includes("SET status='CONNECTED'")) {
                  const provider = values.at(-1)
                  const row = byProvider.get(provider)
                  if (row) {
                    row.status = 'CONNECTED'
                    row.last_checked_at = values[0]
                    row.last_success_at = values[1]
                    row.last_error = null
                    row.updated_at = values[2]
                  }
                }
                return { success: true }
              },
            }
          },
        }
        statement.all = async () => ({ results: [...byProvider.values()] })
        return statement
      },
    },
    get writes() {
      return writes
    },
    row(provider) {
      return byProvider.get(provider)
    },
  }
}

function createAdminApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('currentUser', { id: 'admin-1' })
    await next()
  })
  app.route('/', adminIntegrations)
  return app
}

const successfulKmaResponse = {
  response: {
    header: { resultCode: '00' },
    body: { items: { item: [{ category: 'TMP', fcstDate: '20260908', fcstTime: '1200', fcstValue: '20' }] } },
  },
}

test('public API connection rejects malformed and impossible expiry dates before writing credentials', async () => {
  const store = createDatabase()
  const app = createAdminApp()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify(successfulKmaResponse))

  try {
    for (const expiresAt of ['2026-2-03', '2026-02-29', '2026-13-01']) {
      const response = await app.request(`https://dashboard.example.test/kma/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: { apiKey: 'test-key' }, expiresAt }),
      }, { DB: store.database, AUTH_SECRET: 's'.repeat(32) })

      assert.equal(response.status, 400, `${expiresAt} must be rejected`)
    }
    assert.equal(store.writes, 0, 'invalid expiry dates must be rejected before a credential is written')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('public API connection stores a valid optional expiry date in existing integration metadata', async () => {
  const expiresAt = dateFromToday(30)
  const store = createDatabase()
  const app = createAdminApp()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify(successfulKmaResponse))

  try {
    const response = await app.request('https://dashboard.example.test/kma/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: { apiKey: 'test-key' }, expiresAt }),
    }, { DB: store.database, AUTH_SECRET: 's'.repeat(32) })

    assert.equal(response.status, 200)
    assert.deepEqual(JSON.parse(store.row('kma').metadata), { expiresAt })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('public API summaries surface metadata-backed expiry state without expiring connections on their expiry date', async () => {
  const yesterday = dateFromToday(-1)
  const today = dateFromToday(0)
  const tomorrow = dateFromToday(1)
  const store = createDatabase([
    {
      id: 'intg-expired', provider: 'kma', type: 'public_api', status: 'CONNECTED', encrypted_credential: 'encrypted',
      metadata: JSON.stringify({ expiresAt: yesterday }), connected_at: '2026-01-01T00:00:00.000Z', last_checked_at: null,
      last_success_at: null, last_error: null, updated_by: 'admin-1', updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'intg-today', provider: 'airkorea', type: 'public_api', status: 'CONNECTED', encrypted_credential: 'encrypted',
      metadata: JSON.stringify({ expiresAt: today }), connected_at: '2026-01-01T00:00:00.000Z', last_checked_at: null,
      last_success_at: null, last_error: null, updated_by: 'admin-1', updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'intg-tomorrow', provider: 'g2b', type: 'public_api', status: 'CONNECTED', encrypted_credential: 'encrypted',
      metadata: JSON.stringify({ expiresAt: tomorrow }), connected_at: '2026-01-01T00:00:00.000Z', last_checked_at: null,
      last_success_at: null, last_error: null, updated_by: 'admin-1', updated_at: '2026-01-01T00:00:00.000Z',
    },
  ])

  const response = await createAdminApp().request('https://dashboard.example.test/', undefined, { DB: store.database, AUTH_SECRET: 's'.repeat(32) })
  assert.equal(response.status, 200)
  const body = await response.json()
  const rows = Object.fromEntries(body.data.map((row) => [row.provider, row]))

  assert.deepEqual(
    Object.fromEntries(['kma', 'airkorea', 'g2b'].map((provider) => [provider, {
      status: rows[provider].status,
      expiresAt: rows[provider].expiresAt,
      daysUntilExpiry: rows[provider].daysUntilExpiry,
    }])),
    {
      kma: { status: 'EXPIRED', expiresAt: yesterday, daysUntilExpiry: -1 },
      airkorea: { status: 'CONNECTED', expiresAt: today, daysUntilExpiry: 0 },
      g2b: { status: 'CONNECTED', expiresAt: tomorrow, daysUntilExpiry: 1 },
    },
  )
  assert.deepEqual({
    status: rows.material_prices.status,
    dbConfigured: rows.material_prices.dbConfigured,
    credentialFallbackAvailable: rows.material_prices.credentialFallbackAvailable,
  }, {
    status: 'CONNECTED',
    dbConfigured: false,
    credentialFallbackAvailable: true,
  })
})

test('admin renewal UI uses the native date control, shows expiry details, and submits expiresAt', async () => {
  const page = await vite.ssrLoadModule('/src/client/pages/admin/AdminIntegrationsPage.tsx')
  const source = readFileSync(new URL('../src/client/pages/admin/AdminIntegrationsPage.tsx', import.meta.url), 'utf8')

  assert.ok(page.AdminIntegrationsPage)
  assert.match(source, /type="date"/)
  assert.match(source, /expiresAt/)
  assert.match(source, /daysUntilExpiry/)
  assert.match(source, /만료일/)
  assert.match(source, /남은.*일/)
  assert.match(source, /갱신/)
  assert.match(source, /15000415/)
  assert.match(source, /15129415/)
  assert.match(source, /활용신청/)
  assert.match(source, /승인/)
  assert.match(source, /API Key 입력/)
  assert.match(source, /연결 테스트/)
  assert.match(source, /나라장터 자격증명 재사용 중/)
  assert.match(source, /credential:\s*credInputs[\s\S]*expiresAt|expiresAt[\s\S]*credential:\s*credInputs/)
})

test('material price integration tests the PPS material endpoint instead of the bid endpoint', async () => {
  const store = createDatabase()
  const app = createAdminApp()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    requestedPath = url.pathname
    return new Response(JSON.stringify({
      header: { resultCode: '00' },
      body: { items: [] },
    }))
  }

  try {
    const response = await app.request('https://dashboard.example.test/material_prices/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: { apiKey: ['material', 'key'].join('-') } }),
    }, { DB: store.database, AUTH_SECRET: 's'.repeat(32) })

    assert.equal(response.status, 200)
    assert.match(requestedPath, /PriceInfoService\/getPriceInfoListFcltyCmmnMtrilTotal$/)
    assert.equal(store.row('material_prices').provider, 'material_prices')
  } finally {
    globalThis.fetch = originalFetch
  }
})
