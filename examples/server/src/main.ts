import { createKernel } from '@yatoi/kernel'
import { Routes } from './contract.js'
import { createServerHost } from './host.js'
import { configPlugin } from './plugins/config.js'
import { databasePlugin } from './plugins/database.js'
import { featureExportPlugin } from './plugins/feature-export.js'
import { nightlyCleanupPlugin } from './plugins/nightly-cleanup.js'
import { requestLogPlugin } from './plugins/request-log.js'
import { todosApiPlugin } from './plugins/todos-api.js'

const kernel = createKernel()
const host = createServerHost(kernel)

function printRoutes(label: string) {
  const routes = kernel.list(Routes).map((entry) => `${entry.value.method} ${entry.value.path}`)
  console.log(`${label}: [${routes.join(', ')}]`)
}

async function main() {
  let config = configPlugin({ dbUrl: 'memory://todos', features: [] })
  kernel.load(
    config,
    databasePlugin,
    todosApiPlugin,
    nightlyCleanupPlugin,
    requestLogPlugin((line) => console.log(`[request] ${line}`)),
    featureExportPlugin,
  )
  await kernel.settle()
  printRoutes('initial routes')

  const listening = await host.listen(0)
  console.log(`listening on http://127.0.0.1:${listening.port}`)

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      console.log('\n=== reload config with export enabled ===')
      kernel.unload(config)
      config = configPlugin({ dbUrl: 'memory://todos-v2', features: ['export'] })
      kernel.load(config)
      void kernel.settle().then(() => {
        printRoutes('routes after reload')
        resolve()
      })
    }, 2_000)
  })

  await new Promise((resolve) => setTimeout(resolve, 750))
  await listening.close()
  await kernel.dispose()
  console.log('server stopped cleanly')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
