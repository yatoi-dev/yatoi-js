# Design Brief

What yatoi is, what it is not, and why each decision went the way it
did. This is the decision record; the mechanics are in
[architecture.md](architecture.md), and day-to-day repo instructions are in
[AGENTS.md](../AGENTS.md). If the implementation argues for a different
shape than what's written here, the implementation wins — update this
file rather than quietly diverging.

---

## What we're building

An open-source library that brings a small plugin protocol to React:
**reversible effects, key-based service discovery, and reactive dependency
unload** — implemented against React's scheduler rather than fighting it.

The goal is that anyone can build a fully plugin-based frontend (the kind
DeepSeek Harness has) without giving up normal React productivity.

Secondary goal: this library later powers an agent-first personal
productivity platform, where agents are first-class components and the
product's own UI components are plugins that users can override.

## Why — the React gaps we're closing

React already has reversible effects (`useEffect` cleanup), hierarchical DI
(context), and dynamic code delivery (`lazy` / `import()`). It lacks:

1. **A composition unit that isn't a render-tree node.** Long-lived non-UI
   things (sockets, schedulers, agent runners) have no home except module
   singletons or a god-provider.
2. **Inverted contribution.** A parent must import a child to render it. A
   plugin cannot push UI into a surface it doesn't own.
3. **Capability-level lifecycle.** When a Provider unmounts, consumers don't
   unmount — they re-render with `undefined`. There is no "this subtree
   cannot exist without X."
4. **Runtime-determined module sets.** The plugin list should come from
   config or user installs, not from static imports.

## Non-goals

- Not a state manager. Bring your own (Jotai/Zustand/whatever).
- Not a build tool. Remote plugin delivery is someone else's layer.
- Not a full app framework. No router, no data layer, no opinions about UI.

---

## Naming

**Name: `yatoi`** — the loose tenon in Japanese joinery: a separate piece
belonging to neither board, cut to fit slots in both, carrying load
without being glued in place, so the joint comes apart without damaging
either side. (Literally, a hired hand.) The README carries the full
metaphor; it's the one we explain slots and cascade unload with.

History: `weft` → `yatoyi` (2026-09-20, a misspelling) → `yatoi` (same
day). Scopes: `@yatoi/kernel`, `@yatoi/react`, `@yatoi/slots`,
`@yatoi/loader`.

Availability at rename time: `yatoi` and `@yatoi/{kernel,react,slots}`
all 404 on the npm registry. GitHub org, domain, and trademark not yet
checked — do that before the first publish.

### Naming rules

- **No "react" in the name.** `/kernel` is framework-agnostic by design. A
  `react-*` name makes the eventual Solid or Vue binding awkward and frames
  the kernel — the actually novel part — as a React accessory.
- **No purely descriptive name** (`react-plugin-kernel` and similar). It
  ranks no better than a brandable name with good topics, it's forgettable
  in conversation, and it pins us to React permanently.
- **Discovery lives in metadata, not the name.** GitHub and npm search run
  on topics, the description field, the README `<h1>`, and npm keywords.
  The name only has to be memorable and speakable.

### Repo metadata (set these on day one)

```
Description: Plugin kernel for React. Reversible effects, service discovery,
             and reactive unload — build fully plugin-based frontends.
Topics: react, plugin-architecture, plugin-system, extension-points,
        dependency-injection, micro-kernel, slots, lifecycle
```

### Availability check — run before committing to any name

A name free on GitHub but taken on npm is a name we'll regret. Check all
four surfaces in one pass:

```bash
npm view yatoi           # bare package
npm view @yatoi/kernel   # scope — the binding constraint, check this first
```

`npm view` exiting with `404` means available. Then confirm:

- **npm org/scope** — `@yatoi` must be claimable. Given the layered design,
  this matters more than the bare package name.
- **GitHub org** — `github.com/yatoi` (an org, not a user repo, so packages
  and docs can live together).
- **Domain** — `yatoi.dev` or equivalent.
- **Trademark** — plain search in software/tech classes. Skipping this is
  how projects get renamed at 10k stars.

### Runners-up, with known collisions

| Name | For | Against |
|---|---|---|
| `rhizome` | Root network with no central node | Harder to spell; rhizome.org and some data/crypto projects share it |
| `tendril` | Evokes reaching out and attaching | Longer; an energy-software company held the name |
| `scion` | A grafted shoot — a plugin literally is one | `@scion/workbench` is an existing Angular library. Too close — drop it |
| `cambium` | The living layer where a plant adds tissue | Cambium Networks is a public tech company. Trademark risk |

---

## Package layering

Users stop at the layer they need. Each layer gets its own stability
commitment. The framework slot bindings are opt-in subpath exports: this
removes a second install without flattening slots into the base binding.

| Package | Contains | Depends on React? |
|---|---|---|
| `/kernel` | Scope tree + disposer stack, typed token registry, dependency graph with cascade unload/reload | No |
| `/react` | `<KernelProvider>`, hooks and `<Requires>`; `./slots` adds typed `contribute()` and `<Slot>` | Yes |
| `/slots` | Framework-neutral slot contract: `Slots` interface, `SlotName`, `SlotProps`, `slot()` | No |
| `/vue` | providers, composables and `<Requires>`; `./slots` adds typed `contribute()` and `<Slot>` | No (Vue instead) |
| `/loader` | Manifests, lazy activation, remote loading, isolation | Yes |
| `/devtools` | Graph inspector, why-did-this-unload traces | Yes |

`/kernel` must be testable in plain Node with no DOM. That constraint is
load-bearing — it keeps the protocol honest and makes a server-side or
worker-side kernel possible later.

"Framework-agnostic" here means agnostic within JavaScript: a Solid or
Vue binding reuses `@yatoi/kernel` unchanged. `/vue` and its `./slots` export are
that claim tested, not asserted: `@yatoi/kernel` did not change to build
them. A different language (Dart for Flutter, say) is a second
*implementation* of the protocol, not a binding — which is why the
protocol is written down separately in [spec.md](spec.md), and why the
kernel's test suite is organised as numbered semantics that the spec
cites.

---

## Settled design decisions

### Tokens are not bare strings

Key-based discovery only requires that a consumer not import the
*implementation*. The token itself should be a real TypeScript symbol so
go-to-definition, find-all-references, rename, and AI agents reading the repo
all work.

Two supported forms, both typed:

- **Imported token objects** (Effect's `Context.Tag` / VS Code's
  `createDecorator` style) — best tooling, but you must ship the token.
- **Declaration-merged registry interface** — third parties can
  augment without us shipping their token. Necessary for an open plugin
  ecosystem.

The string inside a token is runtime identity for debugging and
serialization only. It is never what you type at a call site.

### Two mounting modes, explicitly

- **Component-scoped** — `<Plugin of={Foo} />` / `usePlugin()`. React owns the
  scope; disposal on unmount. Cheap, synchronous, StrictMode-safe. For UI
  contributions and view-local behavior. (Lexical proves this works.)
- **Kernel-scoped** — loaded from config or user action, outlives every render
  tree. React only *observes* it. For sockets, agents, schedulers, anything
  async.

Supporting both is what makes this general without making it large. Forcing
everything into one mode is why competing libraries feel wrong to half their
users.

### Manifest / activation split

Contributions are JSON-serializable data, separate from executable
activation code. The shell must be able to render a menu item contributed by
a plugin whose code has not loaded. (VS Code contribution points.)

**This cannot be retrofitted.** It shapes every API. Decide it at line one.

### Never mutate the kernel during render

Kernel mutations happen in event handlers, effects, or outside React
entirely. Enforce it, lint it, and put it in the first paragraph of the
README. Concurrent rendering can discard a render tree; plugin loading is not
rollback-able.

### Async unload behind a sync facade

The kernel owns async. React only ever sees a synchronous snapshot:
`present | absent | loading`. A pending disposal must never be visible to
render. Subscription via `useSyncExternalStore` so concurrent rendering
can't tear.

---

## API sketch

**Status: v0.1 is implemented; this sketch is kept in sync with it.** For
how to *use* the surface see [guide.md](guide.md); this section records
the shape and the reasoning. If the implementation argues for a different
shape, the implementation wins — update this section and the guide.

The property that makes the layer split work: **the kernel stores opaque
values.** It never knows a value is a React component. `@yatoi/react/slots` is
what gives stored values React meaning — `/slots` only owns the
framework-neutral contract (names, prop shapes).

### `/kernel` — no React anywhere

**Status: implemented** (`packages/kernel`, 42 tests in plain Node). What
follows is the real surface; the rest of this sketch is still a target.

```ts
import { createKernel, defineService, defineCollection, definePlugin } from '@yatoi/kernel'

// A token is a real imported symbol, so go-to-definition works.
const Clock = defineService<{ now(): number }>('clock')

const clockPlugin = definePlugin({
  name: 'clock',
  provides: [Clock],                            // must be declared — provide() of anything else throws
  setup(scope) {
    const id = setInterval(tick, 1000)
    scope.defer(() => clearInterval(id))       // reversible effect; disposers run LIFO
    scope.provide(Clock, { now: () => Date.now() })
  },
})

const syncPlugin = definePlugin({
  name: 'sync',
  inject: [Clock, Storage],                     // drives the lifecycle graph
  setup(scope) {
    const clock = scope.get(Clock)              // typed non-null, because declared
    scope.defer(subscribe(clock))
  },
})

const kernel = createKernel()
kernel.load(clockPlugin, syncPlugin)            // registration; activation is derived
```

`inject` is the load-bearing declaration. Unload `clockPlugin` and
`syncPlugin` disposes with it — dependents first, deferred cleanups in
reverse. Reload the clock and sync comes back with a fresh scope.

Things the implementation pinned down:

- **Plugin state machine:** `inactive → starting → active → disposing →
  inactive`, plus `failed` (a throwing/rejecting `setup`). `failed` sticks
  until the plugin is unloaded or a dependency cycles, so a broken plugin
  doesn't retry in a hot loop. `kernel.pluginState(plugin)` / `handle.state`.
- **Sync facade:** all disposers are *invoked* synchronously on unload;
  only their returned promises are awaited. So a token is gone from the
  registry the instant `unload` returns, and a plugin re-activates only after
  its previous scope's promises settle. Observers get `kernel.state(token)`
  → `present | absent | loading` (`loading` = a registered provider is
  mid-setup or mid-teardown; a provider blocked on its *own* deps is
  `absent`). `kernel.subscribe` + `kernel.version` fire once per public
  mutation, for `useSyncExternalStore`.
- **Async setup:** `setup` may return a promise. If the scope is disposed
  before it resolves, whatever it does afterwards is inert — `scope.active`
  is false, `provide`/`contribute` are no-ops with a warning, `defer` runs
  the fn immediately. Nothing leaks. (This is the torture test.)
- **Scope tree:** `scope.load(child)` loads a plugin whose lifetime is bound
  to the parent scope; children dispose before the parent's own disposers.
- **Collections** are the opaque multi-value primitive `/slots` builds on:
  `defineCollection<T>(key)`, `scope.contribute(col, value, { priority, mode })`,
  `kernel.list(col)` (priority-desc, stable, same array ref until changed).
  The kernel stores the mode string; it never interprets it.
- **The registry-interface token form:** `service(key)` / `collection(key)`
  resolve through the augmented `Services` / `Collections` interfaces —
  typed wrappers over `defineService`/`defineCollection`, no new runtime
  behaviour. For third-party plugins that can't depend on the host's
  contract package; the imported-token-object form stays the documented
  default. Both are the same capability because identity is by key.
- **Errors** from `setup` and disposers go to `kernel.on('error', fn)`, or
  `console.error` if nobody listens. They never propagate to the caller of
  `load`/`unload`. Two providers of one token: first wins, second `fail`s.
- Loading the same plugin twice at top level throws; unloading one that
  isn't loaded is a no-op (safe in a React effect cleanup).
- `kernel.settle()` awaits all in-flight setup/disposal; `kernel.dispose()`
  unloads everything then settles. Both mostly for tests.

### `/react` — the bridge

```tsx
<KernelProvider kernel={kernel}>
  <App />
</KernelProvider>
```

```tsx
const clock = useService(Clock)   // Clock | undefined
```

That `| undefined` is deliberate, and it's also the ergonomic trap — people
will reach for `!`. The absence boundary therefore uses a render prop, so
the types are genuinely non-null inside:

```tsx
<Requires of={[Clock, Storage]} fallback={<Spinner />}>
  {(clock, storage) => <Dashboard clock={clock} storage={storage} />}
</Requires>
```

This is the React-native expression of cascade unload: if `Clock` goes away
the subtree unmounts and runs its own effect cleanups, instead of
re-rendering with `undefined` and crashing three components deep.

Component-scoped plugins, for the cheap UI-adjacent case:

```tsx
function Editor() {
  usePlugin(spellcheckPlugin)   // scope tied to this component's lifetime
  return <Surface />
}
```

### `/slots` and the framework `./slots` exports — contribution

Host declares the contract; augmentation is what lets third parties
participate. The augmentation target is `@yatoi/slots` — the
framework-neutral package — regardless of which binding renders it, so a
host using both React and Vue surfaces declares this once:

```ts
declare module '@yatoi/slots' {
  interface Slots {
    'sidebar.item': { collapsed: boolean }
    'task.card': { task: Task }
  }
}
```

A plugin contributes and gets a disposer for free, because contribution is
a scope effect. `@yatoi/react/slots` exports a typed `contribute` that maps the
slot name (via `/slots`' `slot()`) onto a kernel collection — the kernel
itself only ever sees `scope.contribute(collectionToken, opaqueValue,
meta)`. `slot()` in the neutral package returns `CollectionToken<unknown>`
since it can't know what a "renderer" is; `@yatoi/react/slots` narrows it to
`CollectionToken<SlotRenderer<N>>` with one cast at the top of
`contribute()` and `<Slot>` — that cast is where React meaning gets
assigned; `@yatoi/vue/slots` has the same cast, narrowing to its own Vue
`SlotRenderer` instead:

```tsx
import { contribute } from '@yatoi/react/slots'

contribute(scope, 'sidebar.item', ({ collapsed }) =>
  <ClockWidget compact={collapsed} />, { priority: 10 })
```

Overriding a built-in by wrapping it — the pattern that survives the
default changing:

```tsx
contribute(scope, 'task.card', ({ task, Default }) =>
  <Highlighted><Default task={task} /></Highlighted>, { mode: 'wrap' })
```

Host renders:

```tsx
<Slot name="task.card" task={task} mode="single" />
```

Props are checked against `Slots` on both sides. A plugin author gets a type
error for contributing the wrong shape.

### The two audiences this has to serve

- An ordinary app developer writes `usePlugin` and `<Slot>`, never touches
  the kernel directly, and it feels like React.
- A shell developer drives `kernel.load()` from config and treats React as a
  projection — and their kernel is unit-testable without rendering anything.

If either of those stops being true, the API is wrong. `@yatoi/vue` exists
because the same two audiences, and the same test, apply verbatim with
"Vue" substituted for "React" — a second binding is what makes that a
claim about the *kernel's* design rather than a coincidence of React's.

### The honest cost — put this in the README

`inject` + `provides` is a second dependency graph alongside the import
graph, and it is only legible at runtime. That is the tax for late binding.
It's also why `/devtools` is optional in the package list but not optional
in practice.

---

## Open decisions — resolve before v0.1 tags

1. **Service-absence policy — resolved:** `<Requires of={[X]} fallback>`
   with a render prop is the flagship. `useService` returns `T | undefined`
   for the cheap case. No Suspense integration in v0.1; the kernel's
   `loading` status is there when we want it.
2. **Slot resolution modes — resolved:** contributions carry
   `append` / `replace` / `wrap`; the host renders `<Slot mode="list">`
   (all `append`s, priority order) or `<Slot mode="single">` (fold
   `replace`/`wrap` over the host default, highest priority outermost).
   The kernel stores the mode string and never interprets it.
3. **Token versioning** for third-party plugins across breaking changes —
   [proposal 0002](proposals/0002-token-versioning.md), draft.
4. **Do tokens live in a shared package or a global augmented interface? —
   resolved:** both, implemented as `defineService`/`defineCollection`
   (imported token objects) and `service`/`collection` (the `Services` /
   `Collections` registry interfaces). The imported-token-object form,
   shared via a contract package, is the documented default; the registry
   form is for third-party plugins that can't take that dependency.
5. **Namespace isolation** — per-scope resolution of a token, so two
   instances of one plugin set can coexist. The `isolate` vocabulary is
   reserved; the design is [proposal 0001](proposals/0001-namespace-isolation.md),
   draft. Not a v0.1 blocker.

---

## Prior art — read before inventing

**Slots are already solved several times. Do not reinvent that half.**

- **React Cosmos** — slots and plugs; a plug decorates or replaces previous
  plugs, or is named and appended to a list.
- **grlt-hub/react-slots** — declarative slots, Effector-powered.
- **OpenTUI** — typed slot registry, host-defined slot prop types,
  `append` / `replace` / `single_winner` modes.
- **VS Code** — `DisposableStore`, typed service decorators, and
  contribution points declared separately from activation. Closest
  architecture to what we want.
- **Effect (effect-ts)** — `Context.Tag` + `Layer` + `Scope`; finalizers run
  in reverse on scope close. Same protocol with real types. Gap: layers are
  composed at startup, no runtime cascade unload.
- **Lexical** — component-mounted plugins registering via disposer-returning
  calls. Proof the component-scoped mode is idiomatic.

**The gap:** no React library combines a scoped disposer tree with
capability-level DI and cascade unload. That's the half nobody has built, and
it's our positioning. Slots are the layer we build *last*.

---

## v0.1 scope

`/kernel` + `/react` + `/slots`. Probably under 1,500 lines total.
(`/kernel` landed at ~860 lines of source, ~700 excluding the doc-comment
heavy `types.ts`. Budget the rest accordingly.)

The discipline is **resisting `/loader`** until someone files an issue
asking for it.

### Suggested first moves

1. `/kernel` in isolation, no React: scope tree, disposer stack, token
   registry, cascade unload. Full test suite in Node.
2. A deliberately nasty test case — a service that unloads while three
   dependents are mid-async — before any React code exists.
3. `/react` bridge, then run it under StrictMode + concurrent features from
   day one. If it doesn't survive double-invoke, the design is wrong.
4. Slots last.
