# Architecture

For people changing the library. The *decisions* and their rationale live
in [design.md](design.md); this document is the map of how the code
implements them. File references are to `packages/*/src`.

## Layering and the no-DOM constraint

```
slots/   Slot.tsx  contribute.ts  token.ts  types.ts      → depends on react, kernel
react/   context  useService  useContributions  Requires  usePlugin   → depends on kernel
kernel/  token  types  registry  scope  kernel  plugin    → depends on nothing
```

`kernel/tsconfig.json` sets `lib: ["ES2022"]` and `types: []`. Any
reference to `document`, `window`, `setTimeout`, or a Node global is a
compile error. This is load-bearing: it keeps the protocol honest, keeps
the kernel testable in plain Node, and leaves the door open to a worker-
or server-side kernel. `console` is the one exception, declared minimally
in `globals.d.ts`.

The three packages are separate publishable units with their own
stability commitments. Do not merge them.

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
             ┌──────────── deps present ────────────┐
             ▼                                       │
inactive ─▶ starting ──setup returns/resolves──▶ active
   ▲            │                                    │
   │            └──── setup throws/rejects ──▶ failed │
   │                                             │    │
   └────── disposal promises settle ◀── disposing ◀──┘
                                                 ▲
                              deps absent or unload
```

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

- `setup` throws (sync or rejects async): `fail()` marks the record
  `failed`, records `error`, reports it, and disposes the partial scope so
  whatever the setup registered before throwing is unwound.
- A disposer throws: `ScopeImpl.run` catches, reports, and carries on with
  the remaining disposers. Rejected disposer promises are caught the same
  way.
- Reporting goes to `kernel.on('error')` listeners, or `console.error` if
  none. Errors never propagate to the caller of `load`/`unload`.

## React binding

Everything in `@yatoyi/react` is `useSyncExternalStore(kernel.subscribe,
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

## Slots

`@yatoyi/slots` is thin on purpose:

- `token.ts`: `slot(name)` memoises one `CollectionToken<SlotRenderer>`
  per name. The kernel sees an ordinary collection.
- `contribute.ts`: a typed wrapper over `scope.contribute(slot(name), …)`.
  All the type-checking of props against `Slots[name]` happens here.
- `Slot.tsx`: the public `Slot` is a typed *signature* over an untyped
  implementation. Inside the package `Slots` is empty, so `SlotName` is
  `never` and generic code doesn't type-check; the implementation works
  on loose shapes and the export restores the generic type for consumers.
  `composeSingle` folds contributions lowest-priority-first so the
  highest ends up outermost; it's memoised on `(contributions, children)`
  so contributed components keep identity across host re-renders.

The file is `token.ts` rather than `slot.ts` because macOS's
case-insensitive filesystem collides `slot.ts` with `Slot.tsx`.

## Build and test topology

- TypeScript project references (`tsc -b`). `react` references
  `kernel/tsconfig.build.json`; `slots` references both. Typecheck uses
  the non-composite `tsconfig.json` with the same references.
- Vitest projects, one per package: `kernel` in `node`, `react` and
  `slots` in `jsdom` with a `setup.ts` that calls testing-library's
  `cleanup`. All React tests render inside `<StrictMode>` on a
  `createRoot` (concurrent) root.
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
| add a slot resolution mode | `ContributionMode` in kernel `types.ts` (a string; kernel doesn't interpret it), then `Slot.tsx` |
