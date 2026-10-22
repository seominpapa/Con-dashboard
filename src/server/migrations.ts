import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'

export function applyMigrations(sqlite: DatabaseSync, directory: string | URL): void {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory
  const files = readdirSync(root).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
  sqlite.exec('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  for (const name of files) {
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      if (!sqlite.prepare('SELECT name FROM app_migrations WHERE name = ?').get(name)) {
        sqlite.exec(readFileSync(join(root, name), 'utf8'))
        sqlite.prepare('INSERT INTO app_migrations (name) VALUES (?)').run(name)
      }
      sqlite.exec('COMMIT')
    } catch (cause) {
      sqlite.exec('ROLLBACK')
      throw new Error(`Database migration failed: ${name}`, { cause })
    }
  }
}
