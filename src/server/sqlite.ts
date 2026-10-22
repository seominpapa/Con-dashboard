import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { Database, DatabaseStatement } from '../worker/database.ts'
import { applyMigrations } from './migrations.ts'

export function createSqliteDatabase(sqlite: DatabaseSync): Database {
  function statement(sql: string, values: unknown[] = []): DatabaseStatement {
    return {
      bind: (...args) => statement(sql, args),
      first: async <T>() => (sqlite.prepare(sql).get(...values as SQLInputValue[]) as T | undefined) ?? null,
      all: async <T>() => ({ results: sqlite.prepare(sql).all(...values as SQLInputValue[]) as T[] }),
      run: async () => sqlite.prepare(sql).run(...values as SQLInputValue[]),
    }
  }
  return { prepare: (sql) => statement(sql) }
}

export function openSqliteDatabase(path: string, migrationsDirectory: string | URL) {
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new DatabaseSync(path)
  try {
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    applyMigrations(sqlite, migrationsDirectory)
    return { db: createSqliteDatabase(sqlite), close: () => sqlite.close() }
  } catch (error) {
    sqlite.close()
    throw error
  }
}
