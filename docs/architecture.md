# Architecture

For people changing the library. The *decisions* and their rationale live
in [design.md](design.md); the language-neutral *contract* is
[spec.md](spec.md); this document is the map of how the TypeScript code
implements both. File references are to `packages/*/src`.

## Layering and the no-DOM constraint

```
react-slots/  Slot.tsx  contribute.ts  types.ts           → depends on react, slots, kernel
react/        context  useService  useContributions  Requires  usePlugin   → depends on kernel
slots/        token.ts  types.ts                          → depends on kernel only, no React
kernel/       token  types  registry  scope  kernel  plugin    → depends on nothing
```

`kernel/tsconfig.json` sets `lib: ["ES2022"]` and `types: []`. Any
reference to `document`, `window`, `setTimeout`, or a Node global is a
compile error. This is load-bearing: it keeps the protocol honest, keeps
the kernel testable in plain Node, and leaves the door open to a worker-
or server-side kernel. `console` is the one exception, declared minimally
in `globals.d.ts`.

These packages (and their Vue counterparts) are separate publishable
units with their own stability commitments. Do not merge them.

## Kernel data model

Five files, each with one job:

| File | Owns | Knows about |
|---|---|---|
| `token.ts` | `defineService`, `defineCollection`; phantom-typed tokens | nothing |
| `types.ts` | the public interfaces (`Plugin`, `Scope`, `Kernel`, …) | tokens |
| `registry.ts` | service map, collection lists, `version`, listeners, batching | tokens |
| `scope.ts` | `ScopeImpl`: disposer stack, injected snapshot, `provide`/`contribute`/`load` | registry, a narrow `ScopeHost` |
| `kernel.ts` | `KernelImpl`: plugin records, reconcile loop, state machine | everything above |

`plugin.ts` is `definePlugin` — an identity function whose generic pins
`inject` as a tuple so `scope.get` can be typed non-null.

### Tokens

A token is a frozen `{ kind, key }` with a phantom `[TYPE]?: (v: T) => T`
slot. The phantom is a function type so `T` is **invariant**: a
`ServiceToken<Foo>` is not assignable to `ServiceToken<unknown>`, which is
what stops `provide(Clock, wrongShape)` from inferring a union and
compiling. Internal helpers that only need `.key` take `AnyServiceToken`
(`ServiceToken<any>`) for that reason.

`service(key)` / `collection(key)` are typed wrappers over
`defineService`/`defineCollection` that look the key up in the augmented
`Services`/`Collections` interfaces — no runtime behaviour of their own.

### Registry

The registry is the value store plus the single change channel. Every
mutation calls `touch()` (bump `version`, mark dirty); listeners fire once
when the outermost `batch()` ends. Value mutations also call `onChange`
so the kernel can reconcile.

Two invariants the React layer depends on:

- `getService` returns the exact object the plugin provided — stable while
  present, so `useSyncExternalStore` doesn't churn.
- `list(collection)` returns the same frozen array until the collection
  changes, and a shared frozen `EMPTY` when empty. `<Slot>` memoises on
  that reference.

`deleteService(token, owner)` only removes if `owner` still holds the
token. That guards against a stale disposer from a previous instance
evicting a newer provider of the same token.

### Scope

`ScopeImpl` is a plugin instance's handle on its own lifetime:

- A `disposers: Disposer[]` stack. `dispose()` pops LIFO.
- `injected: Map<key, value>` snapshotted in the constructor from the
  registry. `get` reads this first, so injected values are stable for the
  scope's lifetime and still readable in a disposer after the provider
  has already been removed.
- `provided: Set<token>` — what this scope actually published. The
  kernel uses it to find dependents when cascading.
- `active: boolean` — false from the first line of `dispose()`. Every
  mutating method checks it: `provide`/`contribute` become warn-and-return,
  `defer(fn)` runs `fn` immediately, `load` throws.

`dispose()` invokes everything **synchronously** — children first via
`host.disposeChildren`, then own disposers — and returns the array of
promises any of them produced. Nothing is awaited here. That is the sync
facade: by the time `dispose()` returns, every registry effect is undone;
only the promises are outstanding.

The scope talks to the kernel through `ScopeHost` (four methods) rather
than the whole `KernelImpl`, to keep `scope.ts` legible on its own.

## The plugin state machine

```
             ┌──────────── deps present ─────────────┐
             ▼                                        │
inactive ─▶ starting ──setup returns/resolves──────▶ active
   ▲            │                                     │
   │            └──── setup throws/rejects ──▶ failed  │
   │                                             │      │
   └────── disposal promises settle ◀── disposing ◀── deps absent or unload
```

`failed`'s own arrow down into `disposing` is the edge `fail()` added for
§7.3: a failing `setup` whose partial scope registered disposers that
return awaitables does not sit in `failed` while they run — it sits in
`disposing` (with `handle.error` already set) so §7.1's restart gate
applies, and only becomes `failed` once every disposer awaitable has
settled. If `scope.dispose()` returns nothing pending, that hop is
instantaneous and the plugin lands in `failed` directly, as before.
§7.2's reset rule applies during that `disposing` window too: if an
`inject` token goes absent while a failed scope is still disposing,
`handle.error` clears right then, so the record settles to `inactive`
(not `failed`) once cleanup finishes and restarts immediately if deps are
present again — otherwise (deps never went absent) it settles to `failed`
and stays sticky.

One `PluginRecord` per registration: `{ plugin, parent, registered,
state, scope, error, handle }`. The same plugin object can have several
records over time (load → unload → load); at most one is `registered`
per parent. Unregistered records linger only while `disposing`, then
`prune()` drops them.

`failed` exists so a throwing `setup` doesn't retry on every pass. It
clears when the plugin is unloaded or when one of its dependencies goes
away (so a fixed dependency gets a fresh attempt when it returns).

## Reconciliation

Every mutation — public (`load`, `unload`), from a scope (`provide`,
`contribute`, `scope.load`), or from an async completion — funnels
through `KernelImpl.mutate(fn)`:

```
mutate(fn):
  if already inside a mutation: run fn, flag needsPass, return
  else:
    registry.batch(() => {
      run fn
      loop: needsPass = false; pass()   // until a pass changes nothing
      prune()
    })                                  // batch end → one notification
```

`pass()` walks every registered record once and applies the table:

| state | deps present | deps absent |
|---|---|---|
| `inactive` | `start()` | — |
| `starting` / `active` | — | `stop()` |
| `failed` | — | reset to `inactive` |
| `disposing` | wait for promises | wait for promises |

`start()` and `stop()` mutate the registry, which calls `onChange`, which
flags `needsPass` — so the loop runs again until it converges. A guard of
10,000 passes turns a non-converging graph into an error rather than a
hang.

### Why dependents stop before their provider

`stop(rec)` first walks `rec.scope.provided` and stops every registered,
running dependent of each token, recursively, *then* disposes `rec`'s own
scope. So a dependent's disposer can still `scope.get()` the service it
depended on (the injected snapshot has it anyway, but ordering keeps the
provider's own resources alive during dependents' cleanup too). The
reconcile loop would eventually reach the same end state; doing it
eagerly makes the order deterministic and testable.

### Async completions

`start()` with a promise-returning `setup` tracks `result.then(ok, err)`.
Both callbacks first check `stale()` — is `rec.scope` still this scope,
and is it still active? If the scope was disposed mid-await, the outcome
is ignored entirely. Combined with the scope's own `active` checks, this
is what makes the torture test pass: three dependents mid-`await`, the
provider unloads, the awaits resume, and nothing lands.

`stop()` with pending disposal promises sets `disposing` and, when
`Promise.all` settles, runs `mutate(() => state = 'inactive')` — which
triggers a pass, which restarts the plugin if it is still registered and
its deps are back. That is how a reload waits for the previous instance
to finish tearing down.

Every tracked promise goes into `inflight`; `settle()` drains it. Tests
use this instead of timers.

## Error containment

- `setup` throws (sync or rejects async): `fail()` records `error`,
  disposes the partial scope so whatever the setup registered before
  throwing is unwound, **then** reports (§10.1 — dispose before report, so
  nothing a reporter does can observe or leave the partial scope live).
  If disposal left no promises pending, the record becomes `failed`
  immediately; if it did, the record becomes `disposing` instead (see the
  state-machine diagram above) and only becomes `failed` once
  `Promise.all` of those disposals settles.
- A disposer throws: `ScopeImpl.run` catches, reports, and carries on with
  the remaining disposers. Rejected disposer promises are caught the same
  way.
- Reporting goes to `kernel.on('error')` listeners, or `console.error` if
  none. Errors never propagate to the caller of `load`/`unload`.
- A listener passed to `kernel.on('error')` runs in its own try/catch
  inside `reportError`: if it throws, the exception is written to
  `console.error` (named as a listener failure) and every other
  registered listener still runs. A throwing listener can therefore never
  escape `load`/`unload`, and can never stop a sibling listener — or a
  disposer loop reporting through the same path — from completing.

## React binding

Everything in `@yatoi/react` is `useSyncExternalStore(kernel.subscribe,
read, read)` with a carefully chosen `read`:

- `useService`: `read = () => kernel.get(token)`. Snapshot identity is the
  provided object.
- `useServiceState`: caches the last `ServiceState` in a ref and returns
  it again if status and value are unchanged, so the object is stable.
- `useContributions`: `read = () => kernel.list(collection)`. Stable by
  the registry invariant.
- `Requires`: reads every token; returns `null` if any is missing,
  otherwise a tuple cached by element-wise identity. Children only
  re-render when a required value actually changes.
- `usePlugin`: `useEffect(() => { const [h] = kernel.load(p); return () =>
  h.dispose() }, [kernel, p])`. Under StrictMode this is load → unload →
  load, exercising the dispose-then-restart path for real.

There is deliberately no render-time-mutation guard. One was planned; a
reliable one under concurrent rendering isn't cheap, and a guard that
lies is worse than none. The rule is documented instead.

## Vue binding

`@yatoi/vue` mirrors `@yatoi/react` layer for layer; the differences all
trace back to Vue's reactivity model not being React's.

- Vue has no `useSyncExternalStore`. Its analogue is a `shallowRef` seeded
  from a synchronous read, written back inside a `kernel.subscribe`
  callback **only when the new read is `!==` the ref's current value**.
  That identity check is the load-bearing part — without it, every kernel
  mutation would write the ref and trigger every reader's render effect,
  even ones whose own answer didn't change. `useService`, `useServiceState`
  and `useContributions` are each one `shallowRef` plus this pattern, and
  each returns a `shallowReadonly` wrapper so callers can't write into
  what's meant to be a one-way snapshot. Unsubscription happens on
  `onScopeDispose`, so the pattern works equally in a component's
  `setup()` and in a plain composable called from one.
- `Requires` is the same cached-tuple-by-element-identity trick as
  React's, but the default slot receives the tuple as a single argument
  (Vue scoped slots only ever bind one), which is also what makes
  `v-slot="[clock, store]"` compile in a template — array destructuring is
  valid anywhere `v-slot="pattern"` compiles to a function parameter.
- `usePlugin` is `onMounted`/`onBeforeUnmount` around `kernel.load`/
  `handle.dispose()`. There's no StrictMode-style double-invoke to survive,
  but the same load → unload → load contract is real for Vue too: a
  component instance that unmounts and is immediately replaced at the same
  spot (a `:key` change, HMR) must leave exactly one active instance and
  run the first instance's disposers exactly once. The Vue test suite
  asserts this remount case explicitly rather than relying on a framework
  double-invoke to exercise it for free.
- **The naming clash.** Vue's own `provide`/`inject` is the mechanism
  `provideKernel`/`useKernel` are built on, and it collides in vocabulary
  — not behavior — with a *plugin's* `inject:` field on the kernel side
  (`packages/kernel/src/types.ts`'s `PluginDef.inject`). The two are
  unrelated: one is Vue wiring a value through the component tree, the
  other is the kernel's dependency graph. Every doc comment in
  `@yatoi/vue` that says "inject" says whose.
- `KernelProvider`/`useKernel` use an `InjectionKey<Kernel>` symbol;
  `provideKernel(kernel)` is the same thing called directly, for setups
  that don't want a wrapper component.
- `yatoi` (the `app.use(yatoi, { kernel })` Vue plugin) calls `app.provide`
  on the same `InjectionKey`, so it's `provideKernel` at the app root
  instead of a component instance — the difference that lets the root
  component itself be a consumer, since `app.provide` isn't tied to any
  one component's `provide()` call site.
- `useContributionValues` wraps `useContributions` and maps
  `Contribution<T>[]` to `T[]`, caching the mapped array on the identity
  of the underlying `kernel.list()` result so it inherits the same
  no-spurious-trigger guarantee instead of remapping (and re-triggering)
  on every unrelated kernel change.
- No generic component can be declared without an SFC's `<script setup
  generic="T">` macro (which needs `vue-tsc`, off the table under this
  repo's plain-`tsc -b` toolchain). `Requires` and `@yatoi/vue-slots`'s
  `Slot` both use the same fix as `@yatoi/react-slots`' `Slot.tsx`: an
  untyped `defineComponent` implementation, exported under a cast to a
  generic function *signature* that only exists for the type checker.
  `h()` validates real call sites against it; nothing checks it against
  the runtime object it's a lie about, same as `Slot.tsx`'s `as never`.
- `Requires` follows `props.of` reactively (§13.4 last sentence): besides
  the `kernel.subscribe` callback, a `watch(() => props.of, ..., { flush:
  'sync' })` re-reads and resets the tuple-identity cache whenever the
  token list itself changes, so a new `of` is picked up in the same tick
  rather than only on the next unrelated kernel mutation. The watch
  source is keyed on `props.of.map(t => t.key).join('\0')`, not the array
  reference (§2.2 — identity is by key): that both tracks a *reactive*
  `of` array's contents so an in-place mutation (`splice`, index
  assignment) is caught, not just a swapped-out array, and keeps an
  unrelated re-render that hands in a fresh-but-equal-keyed array from
  churning the cache.
- `@yatoi/vue-slots`'s `Slot` follows `props.name` reactively (§13.6
  "reactive name"): the collection token is a `computed(() =>
  slot(props.name))` instead of one fixed at `setup()`, and a `watch` on
  that computed token (also `flush: 'sync'`) re-reads `kernel.list` so
  the contributions ref — and the subscription driving it — both track
  the slot the component is *currently* named after, not the one it
  mounted with.

## Slots

The contract and its bindings are three packages now, not one:

- **`@yatoi/slots`** is the framework-neutral contract, and depends on
  `@yatoi/kernel` only — no React, no Vue, same `lib`/`types`
  discipline as the kernel itself.
  - `types.ts`: the `Slots` augmentation point, `SlotName = keyof Slots &
    string`, `SlotProps<N> = Slots[N]`. This is what a host augments —
    once — regardless of which binding renders it.
  - `token.ts`: `slot(name)` memoises one `CollectionToken<unknown>` per
    name. The kernel sees an ordinary collection; this package can't
    narrow the token's value type further because it doesn't know what a
    "renderer" is. The `slot:${name}` key format is stable for
    cross-bundle interop — a plugin carrying its own copy of
    `@yatoi/slots` reaches the same collection by key alone.
- **`@yatoi/react-slots`** is the React binding. It re-exports
  `Slots`/`SlotName`/`SlotProps`/`slot` from `@yatoi/slots` so
  `import { contribute, type Slots } from '@yatoi/react-slots'` still
  works, and adds:
  - `types.ts`: `SlotRendererProps<N>` (slot props + `Default`) and
    `SlotRenderer<N>`, both React-specific (`ComponentType`/`ReactNode`).
  - `contribute.ts`: a typed wrapper over `scope.contribute(token, …)`.
    All the type-checking of props against `Slots[name]` happens here.
    `slot(name)` returns `CollectionToken<unknown>`; the one cast —
    `as CollectionToken<SlotRenderer<N>>` — narrows it. That cast is the
    layering, not a workaround: it's the exact point where a contribution
    becomes "a React renderer" rather than an opaque value.
  - `Slot.tsx`: the public `Slot` is a typed *signature* over an untyped
    implementation. Inside the package `Slots` is empty (it's declared in
    `@yatoi/slots`, re-exported here), so `SlotName` is `never` and
    generic code doesn't type-check; the implementation works on loose
    shapes and the export restores the generic type for consumers.
    `composeSingle` folds contributions lowest-priority-first so the
    highest ends up outermost; it's memoised on `(contributions,
    children)` so contributed components keep identity across host
    re-renders. Same boundary cast as `contribute.ts`, once, at the top
    of the component.

The file is `token.ts` (in `@yatoi/slots`) rather than `slot.ts` because
macOS's case-insensitive filesystem collides `slot.ts` with `Slot.tsx` in
the binding packages.

`@yatoi/vue-slots` is the same design over `@yatoi/vue` instead, and
depends on `@yatoi/slots` the same way `@yatoi/react-slots` does — same
re-exports, same one boundary cast (to its own `CollectionToken<
SlotRenderer<N>>`, where `SlotRenderer` is a Vue `FunctionalComponent`),
same `composeSingle` fold, same typed-signature-over-untyped-
implementation trick for its `Slot`. Because both bindings now import
`slot()` from the same `@yatoi/slots`, a React `<Slot>` host and a Vue
plugin (or vice versa) land in the same kernel collection for a given
name — not a promise either binding makes about cross-framework
rendering, just a consequence of sharing the token. The one real
mechanical difference from the React binding: a slot's own props are read
off `attrs` (`inheritAttrs: false`) rather than being part of the
component's typed props, because Vue has no equivalent of JSX's
arbitrary-prop-bag spread onto a statically-typed component. `Slots`
itself is **not** declared separately per binding anymore — both re-export
the one interface from `@yatoi/slots`, which is the whole point of the
split: a host using both React and Vue surfaces for the same product
declares its slots once.

## Build and test topology

- TypeScript project references (`tsc -b`). `react` and `vue` each
  reference `kernel/tsconfig.build.json`; `slots` references `kernel` only
  (like the kernel, `lib: ["ES2022"]`/`types: []`); `react-slots`
  references `kernel`, `slots` and `react`; `vue-slots` references
  `kernel`, `slots` and `vue`. Typecheck uses the non-composite
  `tsconfig.json` with the same references.
- Vitest projects, one per package: `kernel` and `slots` in `node` (no
  DOM in either); `react`, `react-slots`, `vue` and `vue-slots` in
  `jsdom`, each with its own `setup.ts`. React's
  calls testing-library's `cleanup`; Vue's resets `document.body.innerHTML`
  (`@vue/test-utils` has no equivalent global auto-cleanup). All React
  tests render inside `<StrictMode>` on a `createRoot` (concurrent) root;
  Vue tests have no such mode to render under, so they assert unmount and
  remount behavior explicitly instead of relying on a framework
  double-invoke to exercise it.
- Cross-package imports in tests and the example resolve to
  `packages/*/src/index.ts` by alias, so neither depends on a prior build.
- TypeScript is pinned to 5.9. 6.x changed defaults and 7.x is the native
  compiler; both are deliberate later upgrades, not accidents.

## Where to make common changes

| Want to… | Touch |
|---|---|
| add a public kernel method | `types.ts` (interface) → `kernel.ts` (impl) → a test in `kernel.test.ts` → the AGENTS.md sketch |
| change plugin activation rules | `KernelImpl.pass()` and `depsPresent()`; the torture test must still pass |
| add a scope capability | `Scope` in `types.ts`, `ScopeImpl`, and `ScopeHost` if it needs the kernel |
| add a React hook | one file in `react/src`, exported from `index.ts`, tested under StrictMode |
| add a Vue composable | one file in `vue/src`, exported from `index.ts`, tested with explicit unmount/remount assertions |
| add a slot resolution mode | `ContributionMode` in kernel `types.ts` (a string; kernel doesn't interpret it), then `@yatoi/react-slots`' `Slot.tsx` and `@yatoi/vue-slots`'s `Slot.ts` (both, same algorithm) |
| change the slot contract itself (`Slots`, `SlotName`, `SlotProps`, `slot()`) | `packages/slots/src` — both bindings re-export, so this is the one place |
