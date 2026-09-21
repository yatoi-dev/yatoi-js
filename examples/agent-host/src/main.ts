import { createKernel } from '@yatoi/kernel'
import type { AnyPlugin, PluginState } from '@yatoi/kernel'
import { PromptSections, Tools } from './contract.js'
import { createAgentHost } from './host.js'
import { scriptedModelPlugin } from './plugins/scripted-model.js'
import { googleAuthPlugin } from './plugins/google-auth.js'
import { calendarSkillPlugin, lastClient } from './plugins/calendar-skill.js'
import { summarizerAgentPlugin } from './plugins/summarizer-agent.js'
import { tracingPlugin } from './plugins/tracing.js'
import { guardrailPlugin } from './plugins/guardrail.js'
import { fakeMcpTransportPlugin } from './plugins/mcp-transport.js'
import { mcpConnectionPlugin } from './plugins/mcp-connection.js'
import { delegationPlugin } from './plugins/delegation.js'

const kernel = createKernel()
kernel.on('error', (error, plugin) => {
  console.error(`[kernel] error in ${plugin.name}:`, error)
})

const modelPlugin = scriptedModelPlugin()
const trace = tracingPlugin((line) => console.log(`  [trace] ${line}`))
const transportPlugin = fakeMcpTransportPlugin()
const delegation = delegationPlugin(kernel)

// Print a compact state-change line whenever any of these plugins moves,
// so the terminal run makes the cascade visible as it happens rather than
// only in the "before/after" snapshots below.
const watched: AnyPlugin[] = [
  modelPlugin,
  googleAuthPlugin,
  calendarSkillPlugin,
  summarizerAgentPlugin,
  transportPlugin,
  mcpConnectionPlugin,
  delegation,
]
let lastStates = new Map<AnyPlugin, PluginState>(watched.map((p) => [p, kernel.pluginState(p)]))
kernel.subscribe(() => {
  for (const p of watched) {
    const state = kernel.pluginState(p)
    if (lastStates.get(p) !== state) {
      console.log(`[kernel] ${p.name}: ${state}`)
      lastStates.set(p, state)
    }
  }
})

function printTools(label: string) {
  const names = kernel.list(Tools).map((c) => c.value.name)
  console.log(`${label} tools: [${names.join(', ')}]`)
}

function printSystemPrompt() {
  const sections = kernel
    .list(PromptSections)
    .map((c) => c.value.text)
    .join('\n')
  console.log(`system prompt:\nYou are a helpful assistant.\n${sections}`)
}

async function main() {
  console.log('=== load ===')
  kernel.load(
    modelPlugin,
    googleAuthPlugin,
    calendarSkillPlugin,
    summarizerAgentPlugin,
    transportPlugin,
    mcpConnectionPlugin,
    delegation,
    trace,
    guardrailPlugin,
  )
  await kernel.settle()
  printTools('initial')
  printSystemPrompt()

  const host = createAgentHost(kernel)

  console.log('\n=== turn: "What\'s on my calendar today?" ===')
  console.log((await host.runTurn("What's on my calendar today?")).reply)

  console.log('\n=== turn: MCP weather ===')
  console.log((await host.runTurn('What is the weather?')).reply)

  console.log('\n=== drop MCP transport ===')
  kernel.unload(transportPlugin)
  await kernel.settle()
  printTools('after MCP drop')

  console.log('\n=== turn: delegate to a short-lived child ===')
  console.log((await host.runTurn('Please delegate this task')).reply)
  printTools('after delegation')

  console.log('\n=== revoke google auth ===')
  kernel.unload(googleAuthPlugin)
  await kernel.settle()
  printTools('after revoke')
  console.log(`calendar client closed: ${lastClient?.closed}`)

  console.log('\n=== same turn again (no calendar tool this time) ===')
  console.log((await host.runTurn("What's on my calendar today?")).reply)

  console.log('\n=== turn: summarize ===')
  const paragraph =
    'The yatoi kernel gives plugins a scope: reversible effects, typed service discovery, and cascade unload, all without touching React.'
  console.log((await host.runTurn(`Please summarize: ${paragraph}`)).reply)

  console.log('\n=== turn: guardrail ===')
  console.log((await host.runTurn('please delete everything')).reply)

  console.log('\n=== reload google auth ===')
  kernel.load(googleAuthPlugin)
  await kernel.settle()
  printTools('after reload')

  console.log('\n=== turn: calendar again ===')
  console.log((await host.runTurn("What's on my calendar today?")).reply)

  await kernel.dispose()
  console.log('\n=== disposed ===')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
