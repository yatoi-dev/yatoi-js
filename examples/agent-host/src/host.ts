import type { Kernel } from '@yatoi/kernel'
import { Middleware, Model, PromptSections, Tools } from './contract.js'
import type { Turn, TurnResult } from './contract.js'

/** Exported so the scripted model can recognize a follow-up turn without
 * the host and the fake model sharing anything but this string. */
export const TOOL_RESULT_MARKER = '\n\n[tool result: '

/**
 * The turn loop. It reads the kernel fresh every turn — that's the whole
 * mechanism. There is no cached tool list, no cached prompt: whatever is
 * active *right now* is what the model sees, so a cascade unload between
 * turns is simply absent from the next read.
 */
export function createAgentHost(kernel: Kernel) {
  async function core(turn: Turn): Promise<TurnResult> {
    const model = kernel.get(Model)
    if (!model) {
      return { reply: 'No model is currently available.', toolCalls: [] }
    }

    const toolCalls: { tool: string; result: string }[] = []
    const first = await model.complete({ system: turn.system, user: turn.user, tools: turn.tools })

    if (first.kind === 'text') {
      return { reply: first.text, toolCalls }
    }

    // `turn.tools` is the snapshot: what the model was *offered* at the
    // start of this turn. Two different questions follow, and they get two
    // different answers:
    //
    // 1. Is this a tool the model was ever offered? If it's not even in the
    //    snapshot, the model asked for something that was never on the
    //    table — a model bug, not an absence.
    // 2. Does it still exist *right now*? That's a live kernel question —
    //    `kernel.list(Tools)` — not something we infer from whether calling
    //    it happens to throw. A tool present in the snapshot but missing
    //    from the live list was cascaded out between the model's reply and
    //    now (a credential revoked mid-turn); that's decided by the kernel,
    //    not by catching an exception. (The closed-client guard in
    //    `calendar-skill.ts` still throws if somehow called anyway — belt
    //    and braces — but the host no longer relies on that throw to detect
    //    unavailability.)
    const offered = turn.tools.some((t) => t.name === first.call.tool)
    if (!offered) {
      const result = `tool "${first.call.tool}" was not offered this turn`
      toolCalls.push({ tool: first.call.tool, result })
      return { reply: `The model asked for a tool it was never offered: ${first.call.tool}.`, toolCalls }
    }

    const live = kernel.list(Tools).find((c) => c.value.name === first.call.tool)
    if (!live) {
      const result = `tool "${first.call.tool}" is no longer available`
      toolCalls.push({ tool: first.call.tool, result })
      return { reply: `I tried to use a tool that's no longer available: ${first.call.tool}.`, toolCalls }
    }
    const tool = live.value

    // The tool exists right now; if running it fails, that's a genuine
    // tool failure, not an absence — report it as such and let the second
    // model call see the failure text like any other tool result.
    let result: string
    try {
      result = await tool.run(first.call.args)
    } catch (err) {
      result = `tool "${tool.name}" failed: ${err instanceof Error ? err.message : String(err)}`
    }
    toolCalls.push({ tool: tool.name, result })

    const second = await model.complete({
      system: turn.system,
      user: turn.user + TOOL_RESULT_MARKER + result + ']',
      tools: turn.tools,
    })
    if (second.kind === 'text') {
      return { reply: second.text, toolCalls }
    }
    return {
      reply: `The model requested another tool call (\`${second.call.tool}\`); this host runs one tool per turn.`,
      toolCalls,
    }
  }

  async function runTurn(user: string): Promise<TurnResult> {
    // Prompt assembly is a slot in list mode: every active skill's section,
    // in priority order, folded into one string the model never sees as
    // "contributed" — it's just its system prompt.
    const sections = kernel
      .list(PromptSections)
      .map((c) => c.value.text)
      .join('\n')
    const system = ['You are a helpful assistant.', sections].filter(Boolean).join('\n')

    // This read is why a cascaded-out skill's tools are gone before the
    // model sees them: there is no separate "unregister tool" step, the
    // list is just shorter on the next call to `runTurn`.
    const tools = kernel.list(Tools).map((c) => c.value)

    const turn: Turn = { user, system, tools }

    // Fold middleware lowest-priority-first so the highest priority ends up
    // outermost — the same fold `<Slot mode="single">` does with `wrap`:
    // each layer receives the next-innermost `next` and decides whether to
    // call it.
    const middleware = [...kernel.list(Middleware)].sort((a, b) => a.priority - b.priority)
    let next = core
    for (const m of middleware) {
      const inner = next
      const fn = m.value
      next = (t: Turn) => fn(t, inner)
    }

    return next(turn)
  }

  return { runTurn }
}
