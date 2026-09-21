import { definePlugin } from '@yatoi/kernel'
import { Middleware } from '../contract.js'

/**
 * Middleware is the `wrap` fold: priority 10 puts tracing outermost, so it
 * logs before and after everything inside it — including the guardrail's
 * short-circuit, since a `next` that's never called still returns through
 * this frame.
 */
export function tracingPlugin(log: (line: string) => void) {
  return definePlugin({
    name: 'tracing',
    setup(scope) {
      scope.contribute(
        Middleware,
        async (turn, next) => {
          log(`→ turn (tools: ${turn.tools.length})`)
          const result = await next(turn)
          log(`← reply: ${result.reply}`)
          return result
        },
        { priority: 10, mode: 'wrap' },
      )
    },
  })
}
