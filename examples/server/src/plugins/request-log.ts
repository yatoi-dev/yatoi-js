import { definePlugin } from '@yatoi/kernel'
import { Middleware } from '../contract.js'

export function requestLogPlugin(log: (line: string) => void, onDispose?: () => void) {
  return definePlugin({
    name: 'request-log',
    setup(scope) {
      if (onDispose) scope.defer(onDispose)
      scope.contribute(
        Middleware,
        async (req, next) => {
          const response = await next(req)
          log(`${req.method} ${req.path} -> ${response.status}`)
          return response
        },
        { priority: 10, mode: 'wrap' },
      )
    },
  })
}
