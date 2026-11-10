// Runs every end-to-end module on one stack, in order: later modules build on the data of earlier ones.
//   npm run e2e        (needs the test database: docker compose -f ../docker-compose.dev.yml up -d db-test)
import { runScenarios, startStack } from './harness.mjs'

const modules = ['./auth.e2e.mjs', './employees.e2e.mjs']

const stack = await startStack({ headless: !process.env.HEADED })
let failures = 0
try {
  for (const file of modules) {
    const module = await import(file)
    failures += await runScenarios(module.title, stack, module.scenarios(stack))
  }
  const logs = stack.serverLogs().trim()
  if (logs) console.log(`\nServer log:\n${logs}`)
} finally {
  await stack.stop()
}
process.exitCode = failures ? 1 : 0
