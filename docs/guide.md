# Guide

Task-oriented. Assumes you've read [concepts](concepts.md). Snippets are
adapted from the test suites and the [example app](../examples/todo); when
in doubt, those are the compiled truth.

## Install

```bash
pnpm add @yatoyi/kernel @yatoyi/react @yatoyi/slots
```

`@yatoyi/kernel` has no dependencies. The other two peer-depend on
`react ^18 || ^19`.

## Create a kernel

One per app, at module scope, outside any component:

```ts
// kernel.ts
import { createKernel } from '@yatoyi/kernel'

export const kernel = createKernel()

kernel.on('error', (error, plugin) => {
  console.error(`plugin "${plugin.name}" failed:`, error)
})
```

Wrap the tree once:

```tsx
<KernelProvider kernel={kernel}>
  <App />
</KernelProvider>
```

## Define a service

A service token names a capability. Default: an imported token object. Put
it where both provider and consumers can import it — a `services.ts`, or
the package that owns the concept:

```ts
import { defineService } from '@yatoyi/kernel'

export interface TodoStore {
  getAll(): readonly Todo[]
  add(title: string): void
  subscribe(listener: () => void): () => void
}

export const Todos = defineService<TodoStore>('todos')
```

The string is runtime identity for debugging. You never type it at a call
site.

When a plugin can't depend on your contract package — the third-party
case — the host publishes a types-only package (a `.d.ts` package, no
runtime code) and the plugin augments `Services` and calls `service(key)`
instead of importing a token; identity is by key, so it resolves the same
capability:

```ts
import { service } from '@yatoyi/kernel'
import type { TodoStore } from '@todo-app/types'

declare module '@yatoyi/kernel' {
  interface Services {
    todos: TodoStore
  }
}
const todos = service('todos') // ServiceToken<TodoStore>
```

## Write a plugin that provides a service

```ts
import { definePlugin } from '@yatoyi/kernel'

export const todosPlugin = definePlugin({
  name: 'todos',
  provides: [Todos],
  setup(scope) {
    const store = createStore(loadFromLocalStorage())
    const stop = store.subscribe(() => saveToLocalStorage(store.getAll()))
    scope.defer(stop)                 // undone on dispose, LIFO
    scope.provide(Todos, store)       // must be listed in `provides`
  },
})
```

Rules the kernel enforces:

- `provide` of a token not in `provides` throws — the plugin fails, others
  are untouched.
- Two active providers of one token: first wins, second fails.
- After the scope disposes, `provide`/`contribute` are no-ops (with a
  console warning) and `defer(fn)` runs `fn` immediately. Nothing leaks
  from a `setup` that finishes late.

## Write a plugin that depends on a service

```ts
export const syncPlugin = definePlugin({
  name: 'sync',
  inject: [Todos, Clock],
  setup(scope) {
    const todos = scope.get(Todos)     // TodoStore, not TodoStore | undefined
    const clock = scope.get(Clock)
    const id = setInterval(() => push(todos.getAll(), clock.now()), 5000)
    scope.defer(() => clearInterval(id))
  },
})
```

`scope.get` is typed non-null for injected tokens and `T | undefined` for
anything else. The injected values are snapshotted at activation and stay
stable for the scope's lifetime — if the underlying service changes, the
scope is disposed and re-run rather than handed a new value mid-flight.

### Async setup

`setup` may return a promise. Check `scope.active` after any `await` if
you're about to do something with side effects the scope can't reverse:

```ts
async setup(scope) {
  const socket = await connect()
  if (!scope.active) { socket.close(); return }   // deps vanished mid-await
  scope.defer(() => socket.close())
  scope.provide(Socket, socket)
}
```

If you forget the check, `provide` is still a no-op after disposal — but
the socket would leak. `defer` before the `await` when you can.

## Load plugins (kernel-scoped)

From bootstrap code, an event handler, or an effect — never during render:

```ts
// bootstrap.ts — runs once before the first render
kernel.load(todosPlugin, clockPlugin, syncPlugin)   // order doesn't matter
```

```ts
// an install button
async function install(id: string) {
  const mod = await pluginModules[id]()
  kernel.load(mod.default)
}
function uninstall(plugin: AnyPlugin) {
  kernel.unload(plugin)   // dependents cascade; no-op if not loaded
}
```

`load` returns handles (`{ state, error, dispose() }`) if you want them.
The plugin **object** is the identity: loading the same object twice at
top level throws, so keep a `Map<id, plugin>` if you load from a manifest.

## Load plugins (component-scoped)

```tsx
const spellcheckPlugin = definePlugin({ name: 'spellcheck', setup(scope) { … } })

function Editor() {
  usePlugin(spellcheckPlugin)   // loaded on mount, unloaded on unmount
  return <Surface />
}
```

Define the plugin at module scope so its identity is stable. Under
StrictMode this becomes load → unload → load; the kernel handles it and
you end up with exactly one active instance. Two mounted components using
the same plugin object is an error — give each its own, or hoist to a
kernel-scoped load.

## Consume a service in React

The recommended shape is `<Requires>`. The render prop's arguments are
non-null, and the subtree unmounts when a service disappears:

```tsx
<Requires of={[Todos]} fallback={<p>Loading…</p>}>
  {(todos) => <Shell todos={todos} />}
</Requires>
```

`of` accepts any number of tokens; the arguments arrive in the same order.

For the cheap case where absence is genuinely fine to render:

```tsx
const clock = useService(Clock)          // Clock | undefined
return <span>{clock ? clock.now() : '—'}</span>
```

To distinguish "absent" from "starting up":

```tsx
const s = useServiceState(Clock)         // { status: 'present', value } | { status: 'absent' } | { status: 'loading' }
```

All three subscribe via `useSyncExternalStore` and re-render only when
their own answer changes, not on every kernel mutation.

### Subscribing to a service's own state

A service is just a value; if it has state, subscribe to it the way you
would any external store:

```ts
export function useTodos(store: TodoStore) {
  return useSyncExternalStore(store.subscribe, store.getAll)
}
```

Keep `getAll()` returning the same array reference until a mutation so
this stays cheap.

## Declare a slot (host side)

```ts
// slots.ts — import this from your entry point so the augmentation is in the program
import type { Todo } from './core/todos'

declare module '@yatoyi/slots' {
  interface Slots {
    'todo.item.extra': { todo: Todo }
    'task.card': { task: Task }
  }
}
```

Render it. Extra props are the slot's props and are forwarded to every
contribution:

```tsx
<Slot name="todo.item.extra" todo={todo} />                 // list mode (default)
<Slot name="task.card" mode="single" task={task}>{DefaultCard}</Slot>
```

- `mode="list"` renders every `append` contribution in priority order
  (higher first). `fallback` renders when there are none.
- `mode="single"` renders one thing: the `children` component (the host
  default) with `replace` and `wrap` contributions folded over it,
  highest priority outermost.

## Contribute to a slot (plugin side)

```tsx
import { contribute } from '@yatoyi/slots'

setup(scope) {
  const todos = scope.get(Todos)

  contribute(scope, 'todo.item.extra', ({ todo }) => (
    <input type="date" value={typeof todo.dueDate === 'string' ? todo.dueDate : ''}
           onChange={(e) => todos.patch(todo.id, { dueDate: e.target.value })} />
  ))

  contribute(scope, 'task.card', ({ task, Default }) => (
    <Highlighted><Default task={task} /></Highlighted>
  ), { mode: 'wrap', priority: 10 })
}
```

The renderer is a React component — hooks are fine inside it. It receives
the slot's props plus `Default` (the renderer beneath it; a no-op in list
mode). Props are checked against `Slots[name]`, so the wrong shape is a
compile error. Removal on unload is automatic.

### Closing over services

Renderers have a fixed signature, so a service from `setup` reaches the
component through a closure. Inline arrow functions do this naturally (as
above). For larger components, a factory keeps things readable:

```tsx
function makeCalendarView(todos: TodoStore) {
  return function CalendarView() {
    const list = useTodos(todos)
    …
  }
}
scope.contribute(Views, { id: 'calendar', label: 'Calendar', View: makeCalendarView(todos) })
```

This looks like one level of indirection too many the first time. It's
the idiomatic way to hand a setup-time dependency to a component React
will call later, after `setup` has returned.

## Contribute data, not UI: collections

When the host needs to *know* what was contributed — ids for routing,
labels for a nav — a slot is the wrong shape. Use a collection:

```ts
// host
export interface ViewDescriptor { id: string; label: string; View: ComponentType }
export const Views = defineCollection<ViewDescriptor>('views')

function Shell() {
  const views = useContributions(Views)       // readonly Contribution<ViewDescriptor>[]
  const active = views.find((c) => c.value.id === activeId)
  return (
    <>
      <nav>{views.map((c) => <button key={c.value.id}>{c.value.label}</button>)}</nav>
      {active ? <active.value.View /> : <Home />}
    </>
  )
}

// plugin
scope.contribute(Views, { id: 'calendar', label: 'Calendar', View })
```

`useContributions` works on any `CollectionToken`; slots are collections
underneath. Each `Contribution` carries `value`, `priority`, `mode` and
`owner` (the contributing plugin's name).

## Load plugins from a manifest

Keep the *description* of a plugin (data) separate from its *code*:

```json
// public/plugins.json
[{
  "id": "calendar",
  "name": "Calendar",
  "version": "0.1.0",
  "description": "…"
}]
```

```ts
// the "loader": id → code. The default shape — bundled with the app, so
// Vite code-splits this like any other dynamic import.
const registry: Record<string, () => Promise<unknown>> = {
  calendar: () => import('./plugins/calendar/index.js'),
}

const mod = await registry[entry.id]?.()
if (typeof mod?.default?.name !== 'string' || typeof mod?.default?.setup !== 'function') {
  throw new Error(`plugin "${entry.id}" has no valid default export`)
}
kernel.load(mod.default)
```

The marketplace UI renders cards from the JSON alone. An id the manifest
describes but the registry doesn't list shows as unavailable — the shell
can describe a plugin it can't run.

**The same thing, with the code on another origin.** The registry doesn't
have to hold code — it can resolve an id to a URL instead, and
dynamic-`import()` that, the way a plugin from a CDN would be loaded:

```ts
const url = `${pluginBase}/${entry.id}.js`
const mod = await import(/* @vite-ignore */ url)
// same validation, same kernel.load(mod.default)
```

Now every id is attemptable, and a missing file is a load failure the UI
can show without the app crashing, rather than "unavailable" — see
`examples/todo`'s "Failed to load" card. Switching between the two is a
deployment decision, not an app-logic one; `examples/todo`'s
`src/marketplace/useMarketplace.ts` picks between them with one `if` keyed
on an env var (`VITE_PLUGIN_BASE`), and the plugin's own source doesn't
change either way. That's the whole "loader" a v0.1 app needs.

**Bundling.** A plugin built to ship as a separate file can bundle its own
copy of `@yatoyi/kernel`, `@yatoyi/slots`, and whatever contract it depends
on — the kernel identifies services, collections and slots by a token's
string `key`, not by object identity (`packages/kernel/src/token.ts`), so a
second copy of the protocol still resolves the host's services and still
contributes to the host's slots. The one thing that must **not** be
bundled is React: externalize `react` and `react/jsx-runtime`, and share a
single instance with the host via an import map. `examples/todo`'s chapter
2 is built exactly this way — see `examples/todo/vite.plugin.config.ts`
(`rollupOptions.external`) and `examples/todo/vite/react-import-map.ts`
for the full mechanics, and
[Pitfalls](pitfalls.md#share-react-not-yatoyi) for why. See the example's
README for the runnable version of both forms.

## Observe the kernel directly

For marketplace badges, devtools, or tests:

```ts
kernel.pluginState(plugin)   // 'inactive' | 'starting' | 'active' | 'disposing' | 'failed'
kernel.state(Clock)          // { status: 'present', value } | { status: 'absent' } | { status: 'loading' }
kernel.get(Clock)            // Clock | undefined
kernel.list(Views)           // readonly Contribution<ViewDescriptor>[]
kernel.subscribe(listener)   // fires once per batch of changes
kernel.version               // bumps on every change — a cheap useSyncExternalStore snapshot
```

## Test without React

The kernel runs in plain Node:

```ts
const kernel = createKernel()
kernel.load(clockPlugin, syncPlugin)
expect(kernel.pluginState(syncPlugin)).toBe('active')

kernel.unload(clockPlugin)
expect(kernel.pluginState(syncPlugin)).toBe('inactive')

await kernel.settle()    // wait for any async setup/disposal
await kernel.dispose()   // unload everything and settle
```

Capture errors instead of letting them hit the console:

```ts
const errors: unknown[] = []
kernel.on('error', (e) => errors.push(e))
```

The kernel's own tests in `packages/kernel/test` are the fullest
reference, including the torture case (a provider unloads while three
dependents are mid-`await`).
