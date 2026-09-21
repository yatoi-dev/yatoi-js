# yatoi agent-host example

Revoke a credential and the skill's tools are gone from the model's tool
list *before its next turn* — not mid-turn, not via a try/catch around a
dead API call. That's the whole pitch. This example is a Node program: no
React, no DOM, no LLM API. It shows the kernel's protocol — reversible
effects, `inject`-driven activation, cascade unload — is the right
composition layer for an agent host, not just for UI.

## Run it

```bash
pnpm --filter yatoi-example-agent-host start
```

Expected output, abbreviated:

```
=== load ===
[kernel] scripted-model: active
[kernel] google-auth: active
[kernel] calendar-skill: active
[kernel] summarizer-agent: active
initial tools: [calendar.list, calendar.create, summarize, mcp.weather, delegate]
...
=== turn: "What's on my calendar today?" ===
  [trace] → turn (tools: 5)
  [trace] ← reply: Here's what I found: events for mj@example.com: [...]

=== revoke google auth ===
[kernel] google-auth: inactive
[kernel] calendar-skill: inactive
after revoke tools: [summarize, delegate]
calendar client closed: true

=== same turn again (no calendar tool this time) ===
  [trace] ← reply: I don't have calendar access right now.
...
=== reload google auth ===
[kernel] google-auth: active
[kernel] calendar-skill: active
after reload tools: [summarize, delegate, calendar.list, calendar.create]
...
=== disposed ===
```

Tests: `pnpm --filter yatoi-example-agent-host test` (or, from the repo
root, `pnpm test -- --project agent-host`).

## Layout

```
src/
  contract.ts                 tokens: Model, GoogleAuth, SummarizerSvc (services),
                               Tools, PromptSections, Middleware (collections)
  host.ts                     createAgentHost(kernel) — the turn loop; reads the
                               kernel fresh every turn
  plugins/
    scripted-model.ts          fake, deterministic ModelProvider — no network
    google-auth.ts              provides GoogleAuth; nothing else
    calendar-skill.ts           inject: [GoogleAuth]; contributes calendar tools
                                 + a prompt section; closes its client on dispose
    summarizer-agent.ts         inject: [Model], provides: SummarizerSvc; also
                                 contributes itself as a `summarize` tool
    mcp-transport.ts            fake MCP transport; provides McpTransport
    mcp-connection.ts           injects the transport; contributes its tools
                                 and server prompt while connected
    delegation.ts               contributes `delegate`; each call loads a
                                 short-lived sub-agent as a child plugin
    tracing.ts                  Middleware, priority 10, mode: 'wrap' — outermost
    guardrail.ts                Middleware, priority 0 — inner; short-circuits
  main.ts                       the terminal demo
test/
  agent-host.test.ts            pins every claim below
```

## What demonstrates what

| In the example | Demonstrates |
|---|---|
| `google-auth.ts` provides `GoogleAuth`; `calendar-skill.ts` declares `inject: [GoogleAuth]` | Capability-level lifecycle: the skill doesn't check `if (auth) {...}` each turn, it simply doesn't exist without the credential. |
| `kernel.unload(googleAuthPlugin)` in `main.ts` / the tests | Revocation is unload, not a bespoke API. Cascade takes `calendar-skill` with it — its tools and prompt section disappear from `host.ts`'s next `kernel.list()` read, before the model's next turn, not during the current one. |
| `scope.defer(() => { client.closed = true })` in `calendar-skill.ts` | Scope effects close what a skill opened. A leaked call after unload throws loudly instead of quietly working — the tool's `run()` checks `client.closed`. |
| `Tools`, `PromptSections`, `Middleware` (`defineCollection` in `contract.ts`) | Contribute data, not UI: the host reads plain objects and functions, never imports a skill. |
| `host.ts` calling `kernel.list(Tools)` / `kernel.list(PromptSections)` fresh inside `runTurn` | This read *is* the mechanism — there's no separate unregister step for a dead skill's tools, the list is just shorter next time. |
| `summarizer-agent.ts`: `inject: [Model]`, `provides: [SummarizerSvc]`, and a `Tools` contribution that calls its own service | A sub-agent is a plugin. It cascades with its dependency (`Model`) like anything else, and it exposes itself to the top-level agent as an ordinary tool. |
| `tracing.ts` (priority 10, `wrap`) wrapping `guardrail.ts` (priority 0) in `host.ts`'s middleware fold | Middleware is the same fold `<Slot mode="single">` does with `mode: 'wrap'` — lowest priority first, so the highest ends up outermost and can log even when an inner layer short-circuits. |
| `host.ts`'s tool lookup: `turn.tools.find(...)` against the snapshot taken at the start of the turn, not a fresh `kernel.list(Tools)` | Snapshot vs. live: a tool that vanishes *between* the model deciding to call it and the host running it is a legitimate "no longer available" result for that turn, not a crash — see the test with the same name. |

## MCP connection: a protocol adapter is still a plugin

`fake-mcp-transport` provides one `McpTransport`. `mcp-connection`
injects that capability, connects it, and contributes the server's tools
to the same `Tools` collection as every local skill. The host has no MCP
branch and no MCP unregister API. When the transport is unloaded, the
connection plugin cascades out: its deferred disconnect runs, and its
tool and prompt contributions leave with its scope. The next turn's fresh
`kernel.list(Tools)` is simply shorter. If the connection drops after the
model selected a tool but before invocation, the host's existing live-list
check reports that the tool is no longer available and never calls the
disconnected transport.

## Delegation: a sub-agent is a child scope

The `delegate` tool calls `scope.load(child)` for one nested turn. That
child provides `SubAgentSession` and contributes its temporary tools, so
they are visible through the same kernel while the turn runs. Disposing
the returned handle removes them and runs the session cleanup once. More
importantly, the handle is not the only ownership link: because the child
was loaded through the delegation plugin's scope, unloading the parent
disposes the child first even if the nested turn is paused. There is no
orphan-session registry or compensating cleanup path; the scope tree is
the ownership model.

The demo mutates the kernel only during bootstrap and between turns. A
turn reads a snapshot, then uses a live lookup only to validate the chosen
tool. Changing the graph from inside the host's request-processing path
would make that boundary ambiguous, so installation and simulated
revocation remain explicit host events.

## What this is not

Not an agent framework. There's no planning loop, no memory store, no
multi-step tool-use orchestration beyond one round-trip — you'd run
LangGraph.js, Mastra, or the OpenAI Agents SDK *inside* this, as the thing
that owns a turn, the way `todosPlugin` owns the todo store in the other
example. What this example is about is what sits *around* that: the set
of tools, prompt sections and middleware being runtime data with a
lifecycle, instead of assembled once before the process starts.

The model (`src/plugins/scripted-model.ts`) is a fake: deterministic,
scripted replies, no network call, no API key. That's deliberate — the
example runs offline and the same way every time, under `vitest`, and the
point is the host around the model, not the model itself.
