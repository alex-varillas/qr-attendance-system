// Prints a one-time link to choose a new password, for an account that cannot sign in.
// It needs access to the database, so only someone who runs the server can use it.
//
//   node src/cli/reset-password.ts owner@example.com
import { loadConfig } from '../config.ts'
import { createPool } from '../db/index.ts'
import { createResetLink } from '../lib/maintenance.ts'

const email = process.argv[2]
if (!email) {
  console.error('Usage: node src/cli/reset-password.ts <email>')
  process.exit(1)
}

const config = loadConfig()
const pool = createPool(config.databaseUrl)
try {
  const base = config.publicUrl ?? `http://localhost:${config.port}`
  const link = await createResetLink(pool, email, base)
  if (!link) {
    console.error('There is no active account with that email.')
    process.exitCode = 1
  } else {
    console.log('Open this link to choose a new password (valid for 24 hours):\n')
    console.log(link)
  }
} finally {
  await pool.end()
}
