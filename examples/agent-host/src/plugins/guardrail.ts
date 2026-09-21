import { definePlugin } from '@yatoi/kernel'
import { Middleware } from '../contract.js'

/**
 * Lower priority than tracing, so it's an inner layer: tracing wraps it,
 * meaning a refusal here still gets logged on the way out.
 */
export const guardrailPlugin = definePlugin({
  name: 'guardrail',
  setup(scope) {
    scope.contribute(
      Middleware,
      async (turn, next) => {
        if (turn.user.toLowerCase().includes('delete everything')) {
          return { reply: "I won't do that.", toolCalls: [] }
        }
        return next(turn)
      },
      { priority: 0, mode: 'wrap' },
    )
  },
})
