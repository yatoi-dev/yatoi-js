import { definePlugin, type Kernel } from '@yatoi/kernel'
import { DbConnection, Middleware } from '../contract.js'

/** Maps an internal capability transition to an HTTP boundary policy. */
export function dbStartingGuardPlugin(kernel: Kernel) {
  return definePlugin({
    name: 'db-starting-guard',
    setup(scope) {
      scope.contribute(
        Middleware,
        async (req, next) => {
          if (req.path === '/todos' && kernel.state(DbConnection).status === 'loading') {
            return { status: 503, body: 'Database starting' }
          }
          return next(req)
        },
        { priority: 20, mode: 'wrap' },
      )
    },
  })
}
