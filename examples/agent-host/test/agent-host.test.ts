import { createKernel, definePlugin } from '@yatoi/kernel'
import { describe, expect, it } from 'vitest'
import { PromptSections, Tools } from '../src/contract.js'
import { createAgentHost } from '../src/host.js'
import { scriptedModelPlugin } from '../src/plugins/scripted-model.js'
import { googleAuthPlugin } from '../src/plugins/google-auth.js'
import { calendarSkillPlugin, lastClient } from '../src/plugins/calendar-skill.js'
import { summarizerAgentPlugin } from '../src/plugins/summarizer-agent.js'
import { tracingPlugin } from '../src/plugins/tracing.js'
import { guardrailPlugin } from '../src/plugins/guardrail.js'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('agent-host', () => {
  it('assembles tools and prompt from all loaded skills', async () => {
    const kernel = createKernel()
    const modelPlugin = scriptedModelPlugin()
    kernel.load(modelPlugin, googleAuthPlugin, calendarSkillPlugin, summarizerAgentPlugin)
    await kernel.settle()

    const names = kernel.list(Tools).map((c) => c.value.name)
    expect(names).toEqual(['calendar.list', 'calendar.create', 'summarize'])

    const prompt = kernel.list(PromptSections).map((c) => c.value.text).join('\n')
    expect(prompt).toContain('calendar events')

    await kernel.dispose()
  })

  it('revoking the credential cascades the skill out before the next turn', async () => {
    const kernel = createKernel()
    const modelPlugin = scriptedModelPlugin()
    kernel.load(modelPlugin, googleAuthPlugin, calendarSkillPlugin)
    await kernel.settle()

    kernel.unload(googleAuthPlugin)
    await kernel.settle()

    expect(kernel.pluginState(calendarSkillPlugin)).toBe('inactive')
    expect(kernel.list(Tools).map((c) => c.value.name)).toEqual([])
    expect(lastClient?.closed).toBe(true)

    const host = createAgentHost(kernel)
    const result = await host.runTurn("What's on my calendar today?")
    expect(result.toolCalls).toHaveLength(0)

    await kernel.dispose()
  })

  it('reloading the credential brings the skill back with a fresh client', async () => {
    const kernel = createKernel()
    const modelPlugin = scriptedModelPlugin()
    kernel.load(modelPlugin, googleAuthPlugin, calendarSkillPlugin)
    await kernel.settle()
    const firstClient = lastClient

    kernel.unload(googleAuthPlugin)
    await kernel.settle()
    kernel.load(googleAuthPlugin)
    await kernel.settle()

    expect(kernel.list(Tools).map((c) => c.value.name)).toEqual(['calendar.list', 'calendar.create'])
    const secondClient = lastClient
    expect(secondClient).not.toBe(firstClient)
    expect(secondClient?.closed).toBe(false)

    const host = createAgentHost(kernel)
    const result = await host.runTurn("What's on my calendar today?")
    expect(result.toolCalls).toHaveLength(1)

    await kernel.dispose()
  })

  it('tracing wraps the guardrail: it logs even when the guardrail short-circuits before the model runs', async () => {
    const kernel = createKernel()
    const calls = { count: 0 }
    const modelPlugin = scriptedModelPlugin({ calls })
    const lines: string[] = []
    const trace = tracingPlugin((line) => lines.push(line))
    kernel.load(modelPlugin, trace, guardrailPlugin)
    await kernel.settle()

    const host = createAgentHost(kernel)
    const result = await host.runTurn('please delete everything')

    expect(result.reply).toMatch(/won't do that/i)
    expect(calls.count).toBe(0) // the model was never called
    expect(lines.some((l) => l.startsWith('→ turn'))).toBe(true)
    expect(lines.some((l) => l.startsWith('← reply'))).toBe(true)

    await kernel.dispose()
  })

  it('the summarizer sub-agent cascades with the model it depends on', async () => {
    const kernel = createKernel()
    const modelPlugin = scriptedModelPlugin()
    kernel.load(modelPlugin, summarizerAgentPlugin)
    await kernel.settle()

    expect(kernel.pluginState(summarizerAgentPlugin)).toBe('active')
    expect(kernel.list(Tools).map((c) => c.value.name)).toEqual(['summarize'])

    kernel.unload(modelPlugin)
    await kernel.settle()
    expect(kernel.pluginState(summarizerAgentPlugin)).toBe('inactive')
    expect(kernel.list(Tools)).toHaveLength(0)

    kernel.load(modelPlugin)
    await kernel.settle()
    expect(kernel.pluginState(summarizerAgentPlugin)).toBe('active')
    expect(kernel.list(Tools).map((c) => c.value.name)).toEqual(['summarize'])

    await kernel.dispose()
  })

  it('a credential revoked between the model deciding to call a tool and the host running it is reported, not thrown', async () => {
    const kernel = createKernel()
    const gate = deferred()
    let released = false
    const modelPlugin = scriptedModelPlugin({
      beforeToolCallReply: async () => {
        await gate.promise
      },
    })
    kernel.load(modelPlugin, googleAuthPlugin, calendarSkillPlugin)
    await kernel.settle()

    const host = createAgentHost(kernel)
    const turnPromise = host.runTurn("What's on my calendar today?")

    // The model has decided to call calendar.list and is awaiting the gate,
    // inside its first `complete()` — before the host has run the tool.
    // Revoke the credential now.
    kernel.unload(googleAuthPlugin)
    await kernel.settle()
    const closedClient = lastClient
    expect(closedClient?.closed).toBe(true)

    gate.resolve()
    released = true
    const result = await turnPromise

    expect(released).toBe(true)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.result).toMatch(/no longer available/)
    expect(result.reply).toMatch(/no longer available/)
    // Decided by the live kernel read, not by catching a throw: the closed
    // client's real methods were never invoked at all.
    expect(closedClient?.calls).toBe(0)

    await kernel.dispose()
  })

  it("a tool that fails on purpose is reported as failed, not as absent — the turn still completes", async () => {
    const kernel = createKernel()
    const modelPlugin = scriptedModelPlugin()
    const failing = definePlugin({
      name: 'failing-tool',
      setup(scope) {
        scope.contribute(Tools, {
          name: 'calendar.list',
          description: 'Always fails.',
          async run() {
            throw new Error('boom')
          },
        })
      },
    })
    kernel.load(modelPlugin, failing)
    await kernel.settle()

    const host = createAgentHost(kernel)
    const result = await host.runTurn("What's on my calendar today?")

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.result).toMatch(/failed: boom/)
    expect(result.toolCalls[0]?.result).not.toMatch(/no longer available/)
    // The turn completes: the second model call still runs and produces a reply.
    expect(result.reply).toBeTruthy()

    await kernel.dispose()
  })
})
