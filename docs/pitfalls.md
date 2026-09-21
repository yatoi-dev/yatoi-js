# Pitfalls

Short and blunt. Each of these has bitten someone or is designed to.

## Never mutate the kernel during render

`kernel.load`, `kernel.unload`, `scope.provide`, `scope.contribute` — all
of it belongs in event handlers, effects, or code that runs outside React
entirely. Concurrent rendering can start a render and throw it away;
plugin loading is not rollback-able.

There is no runtime guard for this. The symptom is React's "Cannot update
a component while rendering a different component" warning, or a plugin
loaded twice with the second load throwing. If you see either, look for a
kernel call in a component body.

## `useService` + `!` is the trap

```tsx
const clock = useService(Clock)!   // don't
```

The `| undefined` is real: the service can disappear while the component
is mounted, and the next render will crash somewhere below. Use
`<Requires>` — the subtree unmounts cleanly when the service goes, and
the render prop's argument is genuinely non-null.

## The plugin object is the identity

The kernel identifies a plugin by object reference, not by `name`.

- Define plugins at module scope. A plugin defined inside a component is a
  new object every render; `usePlugin` will load and unload it every time.
- Loading the same object twice at top level throws. If you load from a
  manifest, keep a `Map<id, plugin>` so uninstall can find the exact
  object install loaded.
- Two mounted components calling `usePlugin` with the same object is an
  error. Give each instance its own plugin object, or hoist to a single
  kernel-scoped load.

## `provide` only what you declare

`scope.provide(T)` where `T` isn't in the plugin's `provides` throws and
fails the plugin. This is deliberate — `inject` + `provides` is the whole
dependency graph, and it has to be readable from the declarations alone.
Two active providers of one token: first wins, second fails.

## Renderers close over setup-time services

A slot renderer's signature is fixed by the `Slots` contract; a view
descriptor's `View` takes no props. Neither has a parameter for "the
store I got from `scope.get`". Hand it over with a closure:

```tsx
function makeDueDateField(todos: TodoStore) {
  return function DueDateField({ todo }: SlotRendererProps<'todo.item.extra'>) { … }
}
contribute(scope, 'todo.item.extra', makeDueDateField(scope.get(Todos)))
```

The first instinct — add a `todos` parameter to the renderer — is a type
error, and the tempting fix (`as any`) hides a real problem: the `Scope`
only exists during `setup`, so a closure is the only thing that can carry
the dependency into a component React calls later.

## Lazy loading and Suspense

Plugin activation (`kernel.load`, `registry[id]()`) and `React.lazy` /
`<Suspense>` are orthogonal — one is a kernel mutation, the other a
render-tree concern. They don't interfere by default, but four seams do.

- **Module-evaluation side effects in a lazily-loaded module.** Fine from
  `bootstrap.ts`; wrong when the module is reached via `React.lazy`,
  because then module evaluation happens *during render* and the kernel's
  synchronous notification changes other components' snapshots mid-render.

  ```ts
  // wrong — runs during React.lazy's render-time import
  kernel.load(spellcheckPlugin)
  export default SpellcheckPanel

  // right — the module exports the plugin, a handler or effect loads it
  export default definePlugin({ name: 'spellcheck', setup(scope) { … } })
  ```

  `usePlugin(spellcheckPlugin)` inside the lazy component is the natural
  form — it's a `useEffect`, so it runs after the Suspense boundary commits.

- **Re-suspension vs. `<Activity>`.** A mounted subtree that suspends again
  is hidden but stays mounted — layout effects tear down and rerun, passive
  effects (so `usePlugin`) are untouched. `<Activity mode="hidden">`
  (React 19.2) is different: it unmounts effects of hidden content and
  recreates them on show, so a component-scoped plugin inside a hidden
  `<Activity>` unloads and reloads with fresh state. Coherent, but anything
  that must survive being hidden belongs kernel-scoped, not component-scoped.

- **Lazy contributions need a `<Suspense>` boundary; `<Slot>` doesn't add
  one.** A plugin may contribute `React.lazy(() => import('./Heavy'))`.
  `<Slot>` renders it and suspends to the nearest `<Suspense>` above the
  *host* — deliberate, a slot shouldn't pick the host's fallback UI. Either
  the host wraps `<Slot>` in `<Suspense>`, or, more politely, the plugin
  wraps its own lazy component so it controls its own placeholder:

  ```tsx
  contribute(scope, 'sidebar.item', () => (
    <Suspense fallback={<Spinner size="sm" />}>
      <LazyWidget />
    </Suspense>
  ))
  ```

  `<Slot>` memoises the composed renderer on the contributions array (see
  `packages/react-slots/src/Slot.tsx`), so the lazy component's identity is
  stable across host re-renders — it doesn't re-suspend or remount when an
  unrelated slot prop changes.

- **`<Requires>` fallback ≠ `<Suspense>` fallback.** `<Requires>` answers
  "is the capability present"; `<Suspense>` answers "has the code arrived".
  They compose but aren't interchangeable — the kernel's `loading` status
  isn't a Suspense signal today, `<Requires>` treats it like absent.
  Bridging it (`useServiceSuspense`) is on the roadmap.

## HMR replaces plugin objects

The kernel identifies a plugin by object reference (see "The plugin object
is the identity" above). Vite HMR hot-replacing a plugin module produces a
*new* object with the same `name` but a different identity.

Component-scoped, this is harmless: `usePlugin`'s dependency changes, the
old instance unloads, the new one loads. Kernel-scoped and loaded at
bootstrap, it isn't — the old object stays loaded, the new one isn't
recognised as a duplicate, so it loads beside the old one, tries to
provide the same token a second time, and fails (spec §10.4: first
provider wins). Nothing throws at the call site; the new plugin just sits
`failed` with an error report. Guard it in the module:

```ts
export const todosPlugin = definePlugin({ … })

if (import.meta.hot) {
  import.meta.hot.dispose(() => kernel.unload(todosPlugin))
}
```

Dev-only, and it only bites the first time someone edits a kernel-scoped
plugin's module with HMR on — without the guard, accept a full reload
instead.

## Async `setup`: check `scope.active` after `await`

If a dependency disappears while your `setup` is awaiting, the scope is
disposed underneath you. `provide`/`contribute` afterwards are harmless
no-ops (with a console warning), but anything you acquired during the
await that the scope can't reverse — a socket, a subscription — leaks
unless you check:

```ts
const socket = await connect()
if (!scope.active) { socket.close(); return }
scope.defer(() => socket.close())
```

Better: `defer` the cleanup *before* the await when you can.

## `loading` vs `absent`

`kernel.state(token)` reports `loading` only when a registered provider is
mid-setup or mid-teardown. A provider that is itself blocked on *its* own
dependencies reads `absent`, not `loading` — "loading" means progress is
being made. Don't show a spinner for a service whose provider isn't going
to activate.

## `failed` sticks

A plugin whose `setup` threw stays `failed` until you unload it or one of
its dependencies cycles. It will not retry on its own. Check
`kernel.pluginState(p)` / `handle.error`, fix the cause, then unload and
load again.

## Don't `import()` the app's modules from the browser console

Testing "what happens if I uninstall from the console" by running
`import('/src/marketplace/useMarketplace.js')` in devtools creates a
**second module graph** with its own `createKernel()` and its own state.
Calls into it look like they work (they write `localStorage`) but touch
nothing the running app uses. Vite serves the app's `.js`-suffixed imports
as `.ts` internally; a raw console import with the wrong extension lands
on a different cache key.

If you need a console handle for debugging, expose the kernel yourself
(`window.__kernel = kernel` in dev) — or better, use the UI you built.

## Share React, not @yatoi

A plugin loaded from a URL (`docs/guide.md` "Load plugins from a
manifest") runs in a bundle built independently of the host. It **must**
externalize `react` and `react/jsx-runtime` — a second copy of React in the
page means the plugin's hooks run against a dispatcher the host's render
loop never sees, and you get "Invalid hook call" (or a silent duplicate-
React warning) instead of a working plugin. The host has to share its own
instance back, typically via a native import map pointing the plugin's bare
`import 'react'` at a re-export of the host's own React — see
`examples/todo/vite/react-import-map.ts` (the `reactImportMap` plugin) and
`examples/todo/vite.plugin.config.ts` (`rollupOptions.external`)
for a worked version, including the build-time gotchas (Rollup can't
statically expand a re-export of a CommonJS module for a consumer outside
its own build — the shim has to name its exports explicitly, not
`export * from 'react'`).

The plugin does **not** need to externalize `@yatoi/kernel`, `@yatoi/slots`,
`@yatoi/react-slots`, or its contract package — it may bundle its own
copies of all four. A service, collection, or slot's identity is its
string `key` (`packages/kernel/src/token.ts`), and slot names are just
collection keys of the form `slot:${name}`, defined once in
`packages/slots/src/token.ts` and shared by every binding.
Two independently bundled tokens with the same key name the same
capability to the host's kernel, no shared object or shared module
instance required. That's what makes "externalize React, bundle
everything else" the right split, not an arbitrary one.

## Slot props are the *host's* contract

`declare module '@yatoi/slots' { interface Slots { … } }` must be in the
program for both the host and every plugin that contributes — import the
file from your entry point. If a plugin sees an empty `Slots`, every slot
name is a type error, which is the correct failure but a confusing one.

## Case-insensitive filesystems

`slot.ts` and `Slot.tsx` are the same file on macOS. That's why the
slot-token helper is `token.ts`. If you add a component and a helper with
names that differ only in case, TypeScript will tell you — eventually,
with an unhelpful error.

## What is *not* a pitfall

- Unloading a plugin that isn't loaded is a no-op, by design, so effect
  cleanups are safe.
- StrictMode's double effect invocation is handled: `usePlugin` becomes
  load → unload → load and ends with exactly one active instance.
- A token's string key colliding between two `defineService` calls is
  fine at runtime (same identity) — but don't do it; make one token and
  share it.
