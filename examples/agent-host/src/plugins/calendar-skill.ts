import { definePlugin } from '@yatoi/kernel'
import { GoogleAuth, PromptSections, Tools } from '../contract.js'
import type { OAuthSession } from '../contract.js'

interface CalendarClient {
  closed: boolean
  /** Bumped on every real `list`/`create` call — lets a test assert the
   * client was never actually invoked, not just that a throw was caught. */
  calls: number
  list(): string
  create(args: Record<string, unknown>): string
}

function makeClient(session: OAuthSession): CalendarClient {
  return {
    closed: false,
    calls: 0,
    list() {
      this.calls += 1
      return `events for ${session.account}: [09:00 standup, 14:00 review]`
    },
    create(args) {
      this.calls += 1
      return `created "${String(args['title'] ?? 'untitled')}" for ${session.account}`
    },
  }
}

// Test-only hook: an example is allowed one module-level escape hatch so
// tests can reach into a plugin's private state without the kernel growing
// a debug API it wouldn't otherwise need. Real code should not do this —
// use the kernel's own state (`pluginState`, `get`) instead.
export let lastClient: CalendarClient | undefined

/**
 * `inject: [GoogleAuth]` is the whole mechanism: this plugin only ever
 * activates while a Google session exists, and is disposed — its tools and
 * prompt section gone, its client closed — the instant `GoogleAuth` goes
 * away, however that happens (explicit revoke, the auth plugin failing,
 * anything).
 */
export const calendarSkillPlugin = definePlugin({
  name: 'calendar-skill',
  inject: [GoogleAuth],
  setup(scope) {
    const session = scope.get(GoogleAuth)
    const client = makeClient(session)
    lastClient = client
    // Reversible effect: closing the client is what makes a leaked call
    // after unload loud (it throws) instead of silently working.
    scope.defer(() => {
      client.closed = true
    })

    scope.contribute(Tools, {
      name: 'calendar.list',
      description: "List today's calendar events.",
      async run() {
        if (client.closed) throw new Error('calendar client is closed')
        return client.list()
      },
    })
    scope.contribute(Tools, {
      name: 'calendar.create',
      description: 'Create a calendar event.',
      async run(args) {
        if (client.closed) throw new Error('calendar client is closed')
        return client.create(args)
      },
    })

    scope.contribute(PromptSections, { text: 'You can read and create calendar events.' }, { priority: 5 })
  },
})
