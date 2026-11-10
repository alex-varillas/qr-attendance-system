import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createPool, runMigrations } from './db/index.ts'
import { startMaintenance } from './lib/maintenance.ts'

const config = loadConfig()
const pool = createPool(config.databaseUrl)
await runMigrations(pool)

const app = await buildApp({ config, pool })
const stopMaintenance = startMaintenance(pool, app.log)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopMaintenance()
    app
      .close()
      .then(() => pool.end())
      .finally(() => process.exit(0))
  })
}

await app.listen({ port: config.port, host: config.host })
