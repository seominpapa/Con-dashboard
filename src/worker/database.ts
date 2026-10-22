/** SQL operations shared by Cloudflare D1 and the Node SQLite runtime. */
export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface Database {
  prepare(sql: string): DatabaseStatement
}
