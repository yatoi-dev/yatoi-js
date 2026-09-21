import { createKernel } from '@yatoi/kernel'
import { describe, expect, it } from 'vitest'
import { DbConnection, Routes } from '../src/contract.js'
import { createServerHost } from '../src/host.js'
import { configPlugin } from '../src/plugins/config.js'
import { databasePlugin } from '../src/plugins/database.js'
import { dbStartingGuardPlugin } from '../src/plugins/db-starting-guard.js'
import { featureExportPlugin } from '../src/plugins/feature-export.js'
import { nightlyCleanupPlugin } from '../src/plugins/nightly-cleanup.js'
import { requestLogPlugin } from '../src/plugins/request-log.js'
import { todosApiPlugin } from '../src/plugins/todos-api.js'

function boot(features: string[] = []) {
  const kernel = createKernel()
  const logLines: string[] = []
  let logDisposals = 0
  const config = configPlugin({ dbUrl: 'memory://one', features })
  const requestLog = requestLogPlugin((line) => logLines.push(line), () => logDisposals++)
  const dbStartingGuard = dbStartingGuardPlugin(kernel)
  kernel.load(
    config,
    databasePlugin,
    todosApiPlugin,
    nightlyCleanupPlugin,
    requestLog,
    dbStartingGuard,
    featureExportPlugin,
  )
  return { kernel, config, requestLog, dbStartingGuard, logLines, logDisposals: () => logDisposals }
}

describe('server example', () => {
  it('boots the capability graph and serves the contributed route', async () => {
    const { kernel, config, requestLog, dbStartingGuard } = boot()
    expect(kernel.state(DbConnection).status).toBe('loading')
    await kernel.settle()

    for (const plugin of [
      config,
      databasePlugin,
      todosApiPlugin,
      nightlyCleanupPlugin,
      requestLog,
      dbStartingGuard,
      featureExportPlugin,
    ]) {
      expect(kernel.pluginState(plugin)).toBe('active')
    }
    const host = createServerHost(kernel)
    const response = await host.handle({ method: 'GET', path: '/todos' })
    expect(response.status).toBe(200)
    expect(response.body).toContain('select * from todos')
    expect(await host.tickJobs(1_000)).toEqual(['nightly-cleanup'])
    await kernel.dispose()
  })

  it('returns 503 for the database-backed route while the database is starting', async () => {
    const { kernel } = boot()
    const host = createServerHost(kernel)

    expect(kernel.state(DbConnection).status).toBe('loading')
    expect(await host.handle({ method: 'GET', path: '/todos' })).toEqual({
      status: 503,
      body: 'Database starting',
    })

    await kernel.settle()
    expect((await host.handle({ method: 'GET', path: '/todos' })).status).toBe(200)
    await kernel.dispose()
  })

  it('cascades routes and jobs out when the database unloads', async () => {
    const { kernel } = boot()
    await kernel.settle()
    const connection = kernel.get(DbConnection)
    const host = createServerHost(kernel)

    kernel.unload(databasePlugin)
    await kernel.settle()

    expect(kernel.pluginState(todosApiPlugin)).toBe('inactive')
    expect(kernel.pluginState(nightlyCleanupPlugin)).toBe('inactive')
    expect((await host.handle({ method: 'GET', path: '/todos' })).status).toBe(404)
    expect(await host.tickJobs(1_000)).toEqual([])
    expect(connection?.closed).toBe(true)
    await kernel.dispose()
  })

  it('reloads database dependents with a fresh connection', async () => {
    const { kernel } = boot()
    await kernel.settle()
    const first = kernel.get(DbConnection)

    kernel.unload(databasePlugin)
    kernel.load(databasePlugin)
    await kernel.settle()
    const second = kernel.get(DbConnection)

    expect(first?.closed).toBe(true)
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    expect(second?.closed).toBe(false)
    expect(kernel.pluginState(todosApiPlugin)).toBe('active')
    expect(kernel.pluginState(nightlyCleanupPlugin)).toBe('active')
    await kernel.dispose()
  })

  it('reloads config to add and remove a feature without disposing unrelated middleware', async () => {
    const started = boot()
    const { kernel, requestLog } = started
    await kernel.settle()
    const host = createServerHost(kernel)

    kernel.unload(started.config)
    let config = configPlugin({ dbUrl: 'memory://two', features: ['export'] })
    kernel.load(config)
    await kernel.settle()
    expect(kernel.list(Routes).map((entry) => entry.value.path)).toContain('/export')
    expect((await host.handle({ method: 'GET', path: '/export' })).status).toBe(200)

    kernel.unload(config)
    config = configPlugin({ dbUrl: 'memory://three', features: [] })
    kernel.load(config)
    await kernel.settle()
    expect(kernel.list(Routes).map((entry) => entry.value.path)).not.toContain('/export')
    expect(kernel.pluginState(requestLog)).toBe('active')
    expect(started.logDisposals()).toBe(0)
    await kernel.dispose()
  })

  it('withdraws services and routes synchronously before settle', async () => {
    const { kernel } = boot()
    await kernel.settle()
    const host = createServerHost(kernel)

    kernel.unload(databasePlugin)

    expect(kernel.state(DbConnection).status).not.toBe('present')
    expect((await host.handle({ method: 'GET', path: '/todos' })).status).toBe(404)
    await kernel.settle()
    await kernel.dispose()
  })
})
