# Roadmap

Where yatoi is going, in tiers rather than dates — there is no team or
release cadence to promise against. *Last reviewed: 2026-09-21.*

How something gets onto this list: an issue describing the need; for
anything that changes the protocol or must be solved in every
implementation, a [proposal](docs/proposals/README.md); a decision
recorded in [docs/design.md](docs/design.md); then an entry here.

Items marked **pick-up-able** have enough design behind them that a
contributor can start without a discussion first; read
[AGENTS.md](AGENTS.md) and the linked sections before you do.

## Now — v0.1, done

Six packages (`@yatoi/kernel`, `@yatoi/react`, `@yatoi/slots`,
`@yatoi/react-slots`, `@yatoi/vue`, `@yatoi/vue-slots`), the todo example
with its two chapters, developer docs, and the
[protocol spec](docs/spec.md). `@yatoi/slots` is the framework-neutral
slot contract (depends on `@yatoi/kernel` only); `@yatoi/react-slots` and
`@yatoi/vue-slots` are thin bindings over it, so a host declares its
`Slots` augmentation once. Tests: the kernel and the neutral `slots`
package in plain Node, the React layer under `<StrictMode>` on a
concurrent root, the Vue layer asserting unmount/remount explicitly (Vue
has no StrictMode), plus the torture case. A second JS binding (Vue)
landed here rather than in *Later* — it reuses `@yatoi/kernel` unchanged,
which is the proof that the layering is real rather than convenient for
React. Not yet published. Also done: an
[agent-host example](examples/agent-host/README.md), a Node program with
no React and no DOM where skills are plugins, tools/prompt/middleware are
collections read fresh each turn, and revoking a credential cascades a
skill's tools out before the model's next turn.

## Next — v0.2

- **Publish `@yatoi/*` to npm.** The scope is free; the manifests carry
  `repository`/`homepage`/`bugs`. Needs: a changeset or release
  workflow, `files`/`exports` verified against a fresh install, and the
  design brief's repo description and topics set once the repo is public.
- **`/devtools`** — *pick-up-able.* A graph inspector (plugins, what they
  provide and inject, current states) and "why did this unload" traces
  built from the cascade order. The [honest cost](README.md#the-honest-cost)
  is why this is optional in the package list but not in practice. Design
  constraint: observe through `subscribe`/`state`/`pluginState` only;
  anything the devtools need that isn't exposed is a kernel API question
  first. Two such questions came out of building the agent-host example
  and should be answered *before* devtools, since a Node host has no
  framework devtools to fall back on: (a) a scoped subscription —
  `kernel.observe(token, cb)` and/or `onPluginState(plugin, cb)` — so a
  host reacts to one thing changing instead of diffing snapshots inside
  `subscribe`; (b) a structured reason on a handle for why a plugin is
  not active — `{ cause: 'dependency-absent', token }` vs
  `{ cause: 'setup-error', error }` — which is the "why did this unload"
  trace at its source. Both are kernel API additions and therefore spec
  §4/§7 changes; small, but they need a proposal or at least a spec edit
  first.
- **Suspense integration** — *pick-up-able.* The kernel exposes
  `loading` (spec §9.4); the React layer doesn't use it. Likely shape: a
  `useServiceSuspense` that throws a promise resolved on the next
  `present`/`absent` transition, sitting beside `<Requires>` rather than
  replacing it.
- **Token versioning** for third-party plugins across breaking changes —
  [proposal 0002](docs/proposals/0002-token-versioning.md), draft. Leaning
  towards a key convention plus adapter plugins now, kernel-level version
  matching only if a real marketplace needs it. Matters once plugins ship
  separately, so it sequences with publishing.
- **Typed `<Requires>` slot under `vue-tsc`** — *pick-up-able.* The Vue
  example showed that `Requires`' generic export (typed for `h()` call
  sites) does not reach `v-slot` destructuring in templates: `todos` is
  `any` there. Declare the default slot's shape on the component (Vue's
  `SlotsType`) so a typo inside the slot is a `vue-tsc` error. Same check
  for `<Slot>`'s `Default`. See `examples/todo-vue/README.md` "Friction".
- **Framework seams, batch 1 — cross-cutting library changes** —
  *pick-up-able*, sequenced first. [Proposal 0004](docs/proposals/0004-contribution-identity-and-render-isolation.md):
  a stable `id` on every contribution (kernel; both `<Slot>`s key on it so
  a reorder or a sibling unloading no longer remounts unrelated items); a
  per-contribution error boundary in both `<Slot>`s that renders nothing
  for the failing item and reports through `kernel.on('error')` with the
  owner; devtools names for anonymous factory-made renderers. One change
  set, spec §11/§13.6, tests in all three slots packages.
- **Framework seams, batch 2 — Vue ergonomics** — *pick-up-able*,
  sequenced second.
  - done: `app.use(yatoi, { kernel })` as a Vue plugin doing the
    app-level provide (removes the "a component can't provide to itself"
    footgun and speaks Vue's dialect).
  - done: `useContributionValues(col)` so `views.value.find(c =>
    c.value.id)` stops meaning two different `.value`s.
  - `createSlot('todo.item.extra')` returning a component whose *type*
    declares that slot's props so `vue-tsc` checks `:todo="todo"` while
    the runtime still reads attrs. Update `examples/todo-vue` to use it
    — that's the test it feels right.
- **Framework seams, batch 3 — `docs/framework-notes.md`** — sequenced
  third; docs only. One page for the decisions that stay with the
  developer, with one-line pointers from `pitfalls.md`:
  *cross-cutting* — SSR/hydration (one kernel per request; load sync
  plugins before hydrate, async after); transitions (kernel mutations are
  urgent, `useSyncExternalStore` de-opts them); host framework context as
  an undeclared dependency (cross-plugin needs are services); CSS
  lifecycle (`<style>` as scope effect vs bundler-injected/`scoped`, which
  persists); plugin configuration and instances via factories (until
  proposal 0001); portals/Teleport (prefer a host slot); testing with a
  provider; React Compiler is fine because all reads go through
  `useSyncExternalStore`; refs into contributions are services, not refs.
  *Vue* — deep `reactive()` wrapping kernel objects (use `shallowRef` /
  `markRaw`; the test-utils `mount(props)` gotcha); `<KeepAlive>` keeps
  `usePlugin` loaded while deactivated (the Suspense-hide analogue, not
  Activity); `defineAsyncComponent` carries its own loading/error UI so a
  lazy Vue contribution needs no boundary; the word "plugin" already means
  `app.use` in Vue.
- **Conformance scenarios as data.** Spec §15's scenarios expressed as
  JSON (load/unload sequences with expected observable states) so every
  implementation runs the same suite. Worth doing when the second
  implementation exists, not before.

## Later

- **`yatoi-dart`** — the Dart kernel and Flutter binding, as a sibling
  repo under `yatoi-dev`, built against the spec. Spec §16 sketches the
  mapping. Blocked on nothing now; sequenced after v0.2 publishing so the
  JS side is stable while it's being ported.
- **A Solid binding.** Cheaper now than Vue was: the pattern (typed
  signature over an untyped implementation for anything generic, a
  tearing-safe read tied to the framework's own subscription primitive)
  is established, and Solid's fine-grained signals are, if anything, a
  closer match to `kernel.subscribe` than Vue's component-level
  reactivity was. The next proof, not the first one.
- **Namespace isolation** — per-scope resolution of a token, so two
  instances of the same plugin set can be live at once (split views,
  multiple workspaces). [Proposal 0001](docs/proposals/0001-namespace-isolation.md),
  draft. Large: it makes lookup, activation and cascade path-relative and
  gives bindings a scope in context. Workarounds exist and are listed
  there; the agent platform's multi-workspace case is what will force it.
- **Declarative contributions** — contributions as data the host
  renders, plus a commands collection for interactivity.
  [Proposal 0003](docs/proposals/0003-declarative-contributions.md), draft.
  What makes plugins dynamic on platforms with no runtime code (Dart
  AOT), lets agents add UI safely, and lets a manifest contribute a menu
  item before its code loads. Sequences with `yatoi-dart`.
- **Move the spec and proposals to `yatoi-dev/spec`** once two
  implementations cite them.

## Only if asked

- **`/loader`** — manifests, lazy activation, remote loading, isolation as
  a package. The example already does all of this in ~60 lines
  (`registry.ts`, the `VITE_PLUGIN_BASE` seam, the import-map plugin),
  and the design brief's position is to resist extracting it until an
  issue shows what a second app needs that the first didn't. Please
  don't open a PR for this without that issue.

## Not planned

Each of these has a good existing answer, and the README's
["Why not…"](README.md#why-not) explains where yatoi sits relative to it:

- State management (bring Jotai, Zustand, signals — a service can hold
  any of them).
- Routing, data fetching, or any other app-framework concern.
- Build tooling or a plugin bundler.
- Module federation / micro-frontend isolation — those are delivery
  concerns; yatoi is the composition layer above them.
- Isolation between plugins in the *security* sense — sandboxing
  untrusted code in a separate realm. Incompatible with host-rendered
  contributions by construction; see proposal 0001 "Not this". (Namespace
  isolation, the other meaning, is under *Later*.)

## Recently resolved

Kept briefly so the history is visible without reading git log.

- Service-absence policy → `<Requires>` (design.md decision 1).
- Slot resolution modes → `append` / `replace` / `wrap` (decision 2).
- Token location → both forms; imported tokens are the default,
  `service(key)` for third parties (decision 4).
- Cross-bundle identity → by key, tested (spec §2.2).
- Non-UI examples → MCP and child-scoped delegation in the agent host,
  a capability-driven `node:http` server, and [Beyond UI](docs/beyond-ui.md).
- Name → `yatoi`, org `yatoi-dev`, repo `yatoi-js`.
- Shared slot-names package for React + Vue hosts (raised while writing
  the Vue example) → `@yatoi/slots` split out as the framework-neutral
  contract (`Slots`, `SlotName`, `SlotProps`, `slot()`), with
  `@yatoi/react-slots` and `@yatoi/vue-slots` as thin bindings over it. A
  host declares `Slots` once and both bindings type-check against it.
- External review (2026-09-21): error-listener isolation, failed-plugin
  restart gating, Vue prop reactivity for `Requires`/`Slot` — fixed with
  regression tests.
