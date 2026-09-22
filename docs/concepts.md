# Concepts

The mental model behind yatoi, in one sitting. Read this before the
[guide](guide.md); read [architecture](architecture.md) if you want to
change the library rather than use it.

## The one-paragraph version

React gives you reversible effects (`useEffect` cleanup), hierarchical DI
(context), and dynamic code delivery (`lazy`). yatoi adds the three things
it lacks for a plugin-based app: **a composition unit that isn't a
render-tree node** (a plugin), **capability-level lifecycle** (a subtree
that cannot exist without a service unmounts when the service goes away),
and **inverted contribution** (a plugin pushes UI into a surface it doesn't
own). It does this with a small kernel that knows nothing about React, and
a thin React binding that only ever *observes* the kernel.

## Four layers

```
@yatoi/react/slots   contribute(), <Slot> for React        React
@yatoi/react         KernelProvider, useService, <Requires> React
@yatoi/slots         Slots interface, SlotName, slot()      no React, no Vue
@yatoi/kernel        plugins, services, cascade unload       no React, no DOM
```

You stop at the layer you need. A shell developer drives the kernel from
config and unit-tests it in Node without rendering anything. An app
developer writes `usePlugin` and `<Slot>` and never touches the kernel
directly. If either of those stops being true, the API is wrong.

## Tokens

A **token** is the key a consumer uses to ask for a capability without
importing the implementation. It is a real TypeScript value — so
go-to-definition, rename and find-all-references work — carrying a phantom
type and a string that is only used for debugging:

```ts
const Clock = defineService<{ now(): number }>('clock')
```

There are two kinds:

- **Service** (`defineService<T>`) — exactly one value at a time.
  Provided by one plugin, consumed by many.
- **Collection** (`defineCollection<T>`) — many values, priority-ordered.
  Contributed to by any number of plugins. Slots are built on collections.

The kernel stores values opaquely. It never knows a value is a React
component; `@yatoi/react/slots` is what gives a stored value React
meaning — `@yatoi/slots` only declares the contract (names and prop
shapes), framework-neutral.

Tokens like `Clock` above are the documented default. There is a second
form, `service(key)`/`collection(key)`, for a plugin that can't depend on
the host's contract package — see [guide.md](guide.md) "Define a service".

## Plugins

A **plugin** is a named unit of behaviour with a declared dependency
graph and a `setup` function:

```ts
const syncPlugin = definePlugin({
  name: 'sync',
  inject: [Clock, Storage],   // activates only when both are present
  provides: [SyncStatus],     // may provide only what it declares
  setup(scope) {
    const clock = scope.get(Clock)        // typed non-null: it's injected
    scope.defer(subscribe(clock))         // reversible effect
    scope.provide(SyncStatus, status)     // published; removed on dispose
  },
})
```

`inject` is the load-bearing declaration. It drives when the plugin runs
and when it is torn down. `provides` is the other half: providing a token
you didn't declare is an error, so the graph is always legible from the
declarations alone.

`definePlugin` is an identity function with types. A plugin is plain data
until a kernel loads it.

## Scope: reversible effects

`setup` receives a **scope** — the plugin's handle on its own lifetime.
Anything a plugin does through the scope is undone automatically when the
scope disposes:

| Call | Effect | Undone by |
|---|---|---|
| `scope.defer(fn)` | registers a cleanup | running `fn` (LIFO order) |
| `scope.provide(token, value)` | publishes a service | removing it from the registry |
| `scope.contribute(collection, value, meta)` | adds to a collection | removing the entry |
| `scope.load(plugin)` | loads a child plugin | unloading the child first |

A scope disposes when its plugin is unloaded, when one of its injected
services disappears, or when its parent scope disposes. There is no
manual "unsubscribe from everything" step.

## Registration vs. activation

`kernel.load(plugin)` **registers** a plugin. Whether it is **active** is
derived: a plugin runs `setup` when every token in its `inject` list is
present, and disposes when any of them goes away. Load order does not
matter.

```
kernel.load(syncPlugin)    // registered, inactive — Clock isn't there yet
kernel.load(clockPlugin)   // clock activates; sync activates right after
kernel.unload(clockPlugin) // sync disposes first, then clock
kernel.load(clockPlugin)   // both come back, sync with a fresh scope
```

This is **cascade unload**: pull one thread and everything that depended
on it unwinds, in dependency order, cleanups running in reverse. Reload
the thread and the dependents re-run `setup`. The plugin author writes no
code for any of this.

## Two mounting modes

A plugin's lifetime is owned either by the kernel or by React:

- **Kernel-scoped** — `kernel.load(p)` from config, a marketplace, or
  bootstrap code. Outlives every render tree. For stores, sockets,
  schedulers, agents: anything long-lived or async. React only observes.
- **Component-scoped** — `usePlugin(p)` inside a component. Loaded on
  mount, unloaded on unmount. Cheap, synchronous, StrictMode-safe. For
  view-local behaviour and UI contributions.

Both are the same plugin type; only who calls `load` differs.

[examples/agent-host](../examples/agent-host/README.md) is the kernel-scoped
case in full, with no React and no DOM in sight: a Node agent host where
skills are plugins, revoking a credential cascades a skill's tools out
before the next turn, and the whole thing runs under a plain test runner.
The [server example](../examples/server/README.md) applies the same model
to routes, jobs, middleware, database revocation, and config reload. See
[Beyond UI](beyond-ui.md) for the shared capability-graph framing and its
boundaries.

## Observing from React

React never mutates the kernel during render and never sees a pending
async operation. It subscribes via `useSyncExternalStore` and reads a
synchronous snapshot:

- `useService(Clock)` → `Clock | undefined`. Cheap, and the `| undefined`
  is the trap — reaching for `!` is how a service disappearing crashes
  three components deep.
- `<Requires of={[Clock]} fallback={…}>{(clock) => …}</Requires>` → the
  render prop's argument is genuinely non-null. When `Clock` goes away
  the subtree **unmounts**, running its own effect cleanups. This is the
  React expression of cascade unload, and the recommended default.
- `useServiceState(Clock)` → `present | absent | loading`, for UIs that
  want to distinguish "not installed" from "starting up".

## Contribution: slots and collections

A plugin cannot render into a surface it doesn't own — a parent must
import a child. Contribution inverts that. The host declares a **slot**
with a props contract; plugins **contribute** renderers; the host renders
`<Slot>` without knowing who contributed:

```tsx
// host
declare module '@yatoi/slots' {
  interface Slots { 'todo.item.extra': { todo: Todo } }
}
<Slot name="todo.item.extra" todo={todo} />

// plugin
contribute(scope, 'todo.item.extra', ({ todo }) => <DueDate todo={todo} />)
```

Props are type-checked on both sides. Because `contribute` is a scope
effect, uninstalling the plugin removes its UI with no further code.

Two resolution modes cover the prior art: `<Slot mode="list">` renders
every `append` contribution in priority order; `<Slot mode="single">`
folds `replace` and `wrap` contributions over the host's default, so an
override can wrap the built-in and call through to it — a pattern that
survives the default changing underneath it.

When the host needs *data about* what was contributed — ids to route on,
labels for a nav — use a plain **collection** instead of a slot. The
kernel stores whatever you put in it; `useContributions(Views)` hands the
list back to React as data. The [example app](../examples/todo/README.md)
uses both and explains when each is the right shape.

## Manifest / activation split

Contributions are JSON-serialisable data, separate from executable code.
A shell can render a marketplace card for a plugin whose code has not
loaded — or does not exist. In the example, `plugins.json` describes
plugins by id; a separate registry (id → `import()`) supplies the code,
`import()`-ed on install. That registry can resolve an id to a bundled
module or, for a plugin shipped as a separately built ESM file, to a URL —
loaded the way a plugin from a CDN would be. Either way that's all the
"loader" a v0.1 app needs; a `/loader` package is deliberately absent
until someone asks for it.

## The honest cost

`inject` + `provides` is a second dependency graph alongside the import
graph, and it is only legible at runtime. That is the tax for late
binding. It's why the kernel keeps its state machine inspectable
(`kernel.pluginState`, `kernel.state`, `kernel.on('error')`) and why a
devtools package is optional in the plan but not optional in practice.
