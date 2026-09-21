import { definePlugin, type Kernel } from '@yatoi/kernel'
import { SubAgentSession, Tools } from '../contract.js'
import { createAgentHost } from '../host.js'

export interface DelegationHooks {
  childStarted?: () => void
  beforeChildReply?: () => Promise<void>
  childDisposed?: () => void
}

let nextSession = 0

/**
 * Contributes a delegate tool whose child plugin exists for one nested turn.
 * Capturing the kernel is host wiring; the child's ownership still comes
 * exclusively from `scope.load`, so parent disposal tears it down first.
 */
export function delegationPlugin(kernel: Kernel, hooks: DelegationHooks = {}) {
  return definePlugin({
    name: 'delegation',
    setup(scope) {
      scope.contribute(Tools, {
        name: 'delegate',
        description: 'Delegate a small task to a short-lived sub-agent.',
        async run(args) {
          const sessionId = `sub-${++nextSession}`
          const session = { id: sessionId, closed: false }
          const child = definePlugin({
            name: `sub-agent-${sessionId}`,
            provides: [SubAgentSession],
            setup(childScope) {
              childScope.provide(SubAgentSession, session)
              childScope.defer(() => {
                session.closed = true
                hooks.childDisposed?.()
              })
              childScope.contribute(Tools, {
                name: 'subagent.echo',
                description: 'Complete the delegated task.',
                async run() {
                  hooks.childStarted?.()
                  await hooks.beforeChildReply?.()
                  return session.closed
                    ? `sub-agent ${session.id} was disposed before completion`
                    : `sub-agent ${session.id}: ${String(args['task'] ?? 'done')}`
                },
              })
            },
          })

          const handle = scope.load(child)
          try {
            const nested = createAgentHost(kernel)
            const result = await nested.runTurn(`sub-agent task: ${String(args['task'] ?? 'help')}`)
            return result.reply
          } finally {
            handle.dispose()
          }
        },
      })
    },
  })
}
