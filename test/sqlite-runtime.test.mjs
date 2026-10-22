import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { createSqliteDatabase, openSqliteDatabase } from '../src/server/sqlite.ts'
import { applyMigrations } from '../src/server/migrations.ts'
import { isSameOriginMutation, useSecureCookies } from '../src/worker/security/origin.ts'

const migrations = new URL('../migrations/', import.meta.url)
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-sqlite-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('SQLite binding is immutable and parameterized; first supports writes returning rows', async (t) => {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  sqlite.exec('CREATE TABLE items (name TEXT UNIQUE, value INTEGER)')
  const db = createSqliteDatabase(sqlite)
  const insert = db.prepare('INSERT INTO items VALUES (?, ?) RETURNING name, value')
  const one = insert.bind("x'); DROP TABLE items;--", 1)
  const two = insert.bind('second', 2)
  assert.equal((await two.first()).value, 2)
  assert.equal((await one.first()).value, 1)
  assert.equal((await db.prepare('SELECT * FROM items ORDER BY value').all()).results.length, 2)
  assert.equal(await db.prepare('SELECT * FROM items WHERE value = ?').bind(3).first(), null)
  await db.prepare('UPDATE items SET value = ? WHERE name = ?').bind(4, 'second').run()
  assert.equal((await db.prepare('SELECT value FROM items WHERE name = ?').bind('second').first()).value, 4)
})

test('all repository migrations apply once and persistent data survives reopening', async (t) => {
  const path = join(temporary(t), 'nested', 'dashboard.sqlite')
  const first = openSqliteDatabase(path, migrations)
  await first.db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').bind('saved', 'value').run()
  first.close()
  const second = openSqliteDatabase(path, migrations)
  t.after(() => second.close())
  assert.equal((await second.db.prepare('SELECT value FROM app_settings WHERE key=?').bind('saved').first()).value, 'value')
  assert.equal((await second.db.prepare('PRAGMA foreign_keys').first()).foreign_keys, 1)
  assert.equal((await second.db.prepare('PRAGMA journal_mode').first()).journal_mode, 'wal')
  assert.equal((await second.db.prepare('SELECT count(*) AS count FROM app_migrations').first()).count, 5)
  await assert.rejects(second.db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)').bind('s', 'missing', '2100').run(), /FOREIGN KEY/)
})

test('a failed migration rolls back schema/data and is never marked applied', (t) => {
  const directory = temporary(t)
  writeFileSync(join(directory, '0001_good.sql'), 'CREATE TABLE saved (value TEXT); INSERT INTO saved VALUES (\'kept\');')
  writeFileSync(join(directory, '0002_bad.sql'), 'DELETE FROM saved; CREATE TABLE partial (id INTEGER); INVALID SQL;')
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  assert.throws(() => applyMigrations(sqlite, directory), /0002_bad.sql/)
  assert.equal(sqlite.prepare('SELECT value FROM saved').get().value, 'kept')
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get(), undefined)
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM app_migrations').get().count, 1)
  writeFileSync(join(directory, '0002_bad.sql'), 'INSERT INTO saved VALUES (\'added\');')
  applyMigrations(sqlite, directory)
  applyMigrations(sqlite, directory)
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM saved').get().count, 2)
})

test('database startup fails on a bad migration and can recover without deleting prior data', async (t) => {
  const directory = temporary(t)
  const path = join(directory, 'saved.sqlite')
  writeFileSync(join(directory, '0001_good.sql'), 'CREATE TABLE saved (value TEXT); INSERT INTO saved VALUES (\'kept\');')
  writeFileSync(join(directory, '0002_bad.sql'), 'DELETE FROM saved; INVALID SQL;')
  assert.throws(() => openSqliteDatabase(path, directory), /0002_bad.sql/)
  writeFileSync(join(directory, '0002_bad.sql'), 'CREATE TABLE added (id INTEGER);')
  const recovered = openSqliteDatabase(path, directory)
  t.after(() => recovered.close())
  assert.equal((await recovered.db.prepare('SELECT value FROM saved').first()).value, 'kept')
})

test('only explicit loopback HTTP uses non-secure cookies', () => {
  for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) assert.equal(useSecureCookies(url), false)
  for (const url of ['https://localhost', 'https://example.test', 'http://example.test', 'invalid', 'http://localhost.example.test']) assert.equal(useSecureCookies(url), true)
})

test('canonical origin comparison fails closed and supports Referer fallback', () => {
  assert.equal(isSameOriginMutation('https://dashboard.example.test', 'https://dashboard.example.test', null), true)
  assert.equal(isSameOriginMutation('https://dashboard.example.test', null, 'https://dashboard.example.test/sites'), true)
  assert.equal(isSameOriginMutation('https://dashboard.example.test', 'https://evil.example.test', 'https://dashboard.example.test/sites'), false)
  assert.equal(isSameOriginMutation('https://dashboard.example.test', null, null), false)
  assert.equal(isSameOriginMutation('invalid', 'null', null), false)
})
