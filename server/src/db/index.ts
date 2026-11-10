import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

// Return DATE columns as plain 'YYYY-MM-DD' strings (never as a Date in the server's timezone)
// and BIGINT as a number, so rows can be sent to the client untouched.
pg.types.setTypeParser(1082, (value) => value)
pg.types.setTypeParser(20, (value) => Number(value))

/** Anything that can run a query: the pool or one connection inside a transaction. */
export interface Queryable {
  query<R extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>
}

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 })
}

export async function withTransaction<T>(pool: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** First row of a query, or null. */
export async function one<R extends pg.QueryResultRow = any>(
  db: Queryable,
  text: string,
  params?: unknown[],
): Promise<R | null> {
  const result = await db.query<R>(text, params)
  return result.rows[0] ?? null
}

export async function many<R extends pg.QueryResultRow = any>(
  db: Queryable,
  text: string,
  params?: unknown[],
): Promise<R[]> {
  const result = await db.query<R>(text, params)
  return result.rows
}

/** The schema is described in schema.ts and applied through generated SQL migrations. */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
  await migrate(drizzle(pool), { migrationsFolder })
}
