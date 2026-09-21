import { definePlugin } from '@yatoi/kernel'
import { Model } from '../contract.js'
import type { ModelProvider, ModelReply } from '../contract.js'
import { TOOL_RESULT_MARKER } from '../host.js'

export interface ScriptedModelHooks {
  /** Bumped once per `complete()` call — lets a test count model calls
   * (e.g. to prove the guardrail short-circuits before the model runs). */
  calls?: { count: number }
  /** Awaited right before returning a tool-call reply, so a test can
   * mutate kernel state (e.g. revoke a credential) between the model
   * deciding to call a tool and the host actually running it. */
  beforeToolCallReply?: () => Promise<void>
}

/**
 * A fake model, deterministic and offline: no network, no LLM API, so the
 * example runs the same way every time and under a test runner. The point
 * of this example is the host around the model, not the model.
 */
export function scriptedModelPlugin(hooks: ScriptedModelHooks = {}) {
  const provider: ModelProvider = {
    async complete({ system, user, tools }): Promise<ModelReply> {
      if (hooks.calls) hooks.calls.count += 1

      // The summarizer sub-agent calls the model with its own system
      // prompt, not a user turn — recognize that first.
      if (system.includes('Summarize the user text')) {
        const words = user.trim().split(/\s+/).slice(0, 8).join(' ')
        return { kind: 'text', text: `In short: ${words}...` }
      }

      const resultIndex = user.indexOf(TOOL_RESULT_MARKER)
      if (resultIndex !== -1) {
        const result = user.slice(resultIndex + TOOL_RESULT_MARKER.length, -1)
        return { kind: 'text', text: `Here's what I found: ${result}` }
      }

      const lower = user.toLowerCase()

      // Must precede `delegate`: a nested turn's text matches both branches.
      if (lower.includes('sub-agent')) {
        const tool = tools.find((t) => t.name === 'subagent.echo')
        if (tool) return { kind: 'tool', call: { tool: tool.name, args: {} } }
        return { kind: 'text', text: 'The sub-agent tool is no longer available.' }
      }

      if (lower.includes('delegate')) {
        const tool = tools.find((t) => t.name === 'delegate')
        if (tool) return { kind: 'tool', call: { tool: tool.name, args: { task: user } } }
      }

      if (lower.includes('weather')) {
        const tool = tools.find((t) => t.name === 'mcp.weather')
        if (tool) {
          await hooks.beforeToolCallReply?.()
          return { kind: 'tool', call: { tool: tool.name, args: {} } }
        }
        await hooks.beforeToolCallReply?.()
        return { kind: 'text', text: 'The MCP weather server is not connected.' }
      }

      if (lower.includes('calendar')) {
        const tool = tools.find((t) => t.name === 'calendar.list')
        if (tool) {
          await hooks.beforeToolCallReply?.()
          return { kind: 'tool', call: { tool: tool.name, args: {} } }
        }
        await hooks.beforeToolCallReply?.()
        return { kind: 'text', text: "I don't have calendar access right now." }
      }

      if (lower.includes('summar')) {
        const tool = tools.find((t) => t.name === 'summarize')
        if (tool) {
          const text = user.replace(/^please summarize:\s*/i, '')
          return { kind: 'tool', call: { tool: tool.name, args: { text } } }
        }
      }

      const names = tools.map((t) => t.name)
      return {
        kind: 'text',
        text: names.length > 0 ? `I can help with: ${names.join(', ')}` : 'Nothing is installed.',
      }
    },
  }

  return definePlugin({
    name: 'scripted-model',
    provides: [Model],
    setup(scope) {
      scope.provide(Model, provider)
    },
  })
}
