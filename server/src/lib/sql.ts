const IDENTIFIER = /^[a-z][a-z0-9_]*$/

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
}

/** Drops keys whose value is undefined (an absent field), keeping null (an explicit "clear"). */
export function definedEntries(data: Record<string, unknown>): [string, unknown][] {
  return Object.entries(data).filter(([, value]) => value !== undefined)
}

/**
 * INSERT built from an object whose keys come from a validated schema (never from raw user input).
 * Identifiers are checked anyway, and every value is passed as a parameter.
 */
export function buildInsert(table: string, data: Record<string, unknown>): { text: string; values: unknown[] } {
  assertIdentifier(table)
  const entries = definedEntries(data)
  if (entries.length === 0) return { text: `INSERT INTO ${table} DEFAULT VALUES RETURNING *`, values: [] }
  for (const [key] of entries) assertIdentifier(key)
  const columns = entries.map(([key]) => key).join(', ')
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ')
  return {
    text: `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
    values: entries.map(([, value]) => value),
  }
}

export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  idColumn: string,
  idValue: unknown,
): { text: string; values: unknown[] } | null {
  assertIdentifier(table)
  assertIdentifier(idColumn)
  const entries = definedEntries(data)
  if (entries.length === 0) return null
  for (const [key] of entries) assertIdentifier(key)
  const assignments = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')
  return {
    text: `UPDATE ${table} SET ${assignments} WHERE ${idColumn} = $${entries.length + 1} RETURNING *`,
    values: [...entries.map(([, value]) => value), idValue],
  }
}
