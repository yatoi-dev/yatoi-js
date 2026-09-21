import { createKernel, definePlugin } from '@yatoi/kernel'
import { describe, expect, it } from 'vitest'
import { PromptSections, SubAgentSession, Tools } from '../src/contract.js'
import { createAgentHost } from '../src/host.js'
import { scriptedModelPlugin } from '../src/plugins/scripted-model.js'
import { googleAuthPlugin } from '../src/plugins/google-auth.js'
import { calendarSkillPlugin, lastClient } from '../src/plugins/calendar-skill.js'
import { summarizerAgentPlugin } from '../src/plugins/summarizer-agent.js'
import { tracingPlugin } from '../src/plugins/tracing.js'
import { guardrailPlugin } from '../src/plugins/guardrail.js'
import { fakeMcpTransportPlugin, lastMcpTransport } from '../src/plugins/mcp-transport.js'
import { mcpConnectionPlugin } from '../src/plugins/mcp-connection.js'
import { delegationPlugin } from '../src/plugins/delegation.js'

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

  it('removes MCP tools when the transport drops and never invokes one after disconnect', async () => {
    const kernel = createKernel()
    const gate = deferred()
    const modelPlugin = scriptedModelPlugin({ beforeToolCallReply: () => gate.promise })
    const transportPlugin = fakeMcpTransportPlugin()
    kernel.load(modelPlugin, transportPlugin, mcpConnectionPlugin)
    await kernel.settle()

    const host = createAgentHost(kernel)
    gate.resolve()
    const first = await host.runTurn('What is the weather?')
    expect(first.toolCalls[0]?.tool).toBe('mcp.weather')
    expect(lastMcpTransport?.calls).toBe(1)

    const secondGate = deferred()
    const gatedModel = scriptedModelPlugin({ beforeToolCallReply: () => secondGate.promise })
    kernel.unload(modelPlugin)
    kernel.load(gatedModel)
    const pending = host.runTurn('What is the weather?')

    kernel.unload(transportPlugin)
    await kernel.settle()
    expect(kernel.pluginState(mcpConnectionPlugin)).toBe('inactive')
    expect(kernel.list(Tools).map((c) => c.value.name)).not.toContain('mcp.weather')
    expect(lastMcpTransport?.connected).toBe(false)

    secondGate.resolve()
    const dropped = await pending
    expect(dropped.reply).toMatch(/no longer available/)
    expect(lastMcpTransport?.calls).toBe(1)

    const next = await host.runTurn('What is the weather?')
    expect(next.toolCalls).toHaveLength(0)
    expect(lastMcpTransport?.calls).toBe(1)
    await kernel.dispose()
  })

  it('loads a sub-agent as a child for one nested turn, then disposes it once', async () => {
    const kernel = createKernel()
    const modelPlugin = scriptedModelPlugin()
    let disposals = 0
    const delegation = delegationPlugin(kernel, { childDisposed: () => disposals++ })
    kernel.load(modelPlugin, delegation)

    const host = createAgentHost(kernel)
    const result = await host.runTurn('Please delegate this task')

    expect(result.toolCalls[0]?.tool).toBe('delegate')
    expect(kernel.get(SubAgentSession)).toBeUndefined()
    expect(kernel.list(Tools).map((c) => c.value.name)).toEqual(['delegate'])
    expect(disposals).toBe(1)
    await kernel.dispose()
  })

  it('disposes the child when delegation is unloaded during the nested turn', async () => {
    const kernel = createKernel()
    const started = deferred()
    const release = deferred()
    let disposals = 0
    const delegation = delegationPlugin(kernel, {
      childStarted: () => started.resolve(),
      beforeChildReply: () => release.promise,
      childDisposed: () => disposals++,
    })
    kernel.load(scriptedModelPlugin(), delegation)

    const host = createAgentHost(kernel)
    const pending = host.runTurn('Please delegate this task')
    await started.promise
    expect(kernel.get(SubAgentSession)).toBeDefined()
    expect(kernel.list(Tools).map((c) => c.value.name)).toContain('subagent.echo')

    kernel.unload(delegation)
    await kernel.settle()
    expect(kernel.get(SubAgentSession)).toBeUndefined()
    expect(kernel.list(Tools).map((c) => c.value.name)).not.toContain('subagent.echo')
    expect(disposals).toBe(1)

    release.resolve()
    await pending
    expect(disposals).toBe(1)
    await kernel.dispose()
  })
})
