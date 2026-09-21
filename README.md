# yatoi

**Plugins for React that come apart cleanly.** A small kernel that gives
React the two properties a plugin system actually needs — remove a plugin
and *everything it did is undone*; a plugin runs *only while what it needs
exists* — and a React binding that only ever observes it.

A **yatoi** is the loose tenon in Japanese joinery: a separate piece,
belonging to neither board, cut to fit slots in both and inserted to hold
them together. Literally, a hired hand. It carries load without being
glued in place, and the joint comes apart without damaging either side.
yatoi provides the slots, the fit, and the guarantee that pulling a piece
out leaves nothing behind.

## The problem

React composes beautifully — as long as the app's authors decide, at build
time, what the app is made of. Two things break the moment that stops
being true:

- **A parent must import its children.** Nothing can add UI to a surface
it doesn't own. A plugin can't put an item in *your* sidebar.
- **Nothing is required, only read.** When a context provider unmounts,
its consumers don't unmount — they re-render with `undefined`, and the
`!` someone added three components deep crashes. There is no way to
say "this subtree cannot exist without X."

Add a third, quieter one: long-lived things that aren't UI — sockets,
schedulers, agent runners — have no home in React except a module
singleton or a god-provider, and no lifecycle that can be reversed.

## Two properties

The paper behind [Cordis](#inspired-by-cordis) names the two properties a
system needs before components can be added and removed at runtime
without disturbing each other. In plain words:


|              | What it means                                   | yatoi                                                                                                                                                         | React today                                                              |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Temporal** | Remove a plugin and everything it did is undone | Every effect a plugin makes through its scope — `defer`, `provide`, `contribute` — carries its inverse, which the kernel holds and runs in reverse on dispose | `useEffect` cleanup, but only for render-tree nodes, and only on unmount |
| **Spatial**  | A plugin runs only while what it needs exists   | `inject` declares requirements; activation is *derived* from what's present, and pulling a requirement unloads every dependent, in dependency order           | None. Context is a read, not a requirement                               |


Together the paper calls this **spatiotemporal composability**. React has
the temporal half for render-tree nodes and nothing else, and none of the
spatial half. yatoi adds both — as a kernel that knows nothing about
React, with React subscribed to it.

## In thirty seconds

```ts
import { createKernel, defineService, definePlugin } from '@yatoi/kernel'

const Clock = defineService<{ now(): number }>('clock')   // a real symbol, not a string

const clockPlugin = definePlugin({
  name: 'clock',
  provides: [Clock],
  setup(scope) {
    const id = setInterval(tick, 1000)
    scope.defer(() => clearInterval(id))            // temporal: undone on unload
    scope.provide(Clock, { now: () => Date.now() }) // temporal: removed on unload
  },
})

const syncPlugin = definePlugin({
  name: 'sync',
  inject: [Clock],                                  // spatial: runs only while Clock is present
  setup(scope) { scope.defer(subscribe(scope.get(Clock))) },  // typed non-null
})

const kernel = createKernel()
kernel.load(syncPlugin, clockPlugin)   // order doesn't matter; sync activates when Clock appears
kernel.unload(clockPlugin)             // sync disposes first, cleanups in reverse
kernel.load(clockPlugin)               // both come back, sync with a fresh scope
```

The same two properties, projected into the render tree:

```tsx
// React today: a read that can go stale
const clock = useContext(ClockContext)   // Clock | undefined once the provider is gone
clock!.now()                             // and here is the crash

// yatoi: a requirement the subtree cannot exist without
<Requires of={[Clock]} fallback={<Installing />}>
  {(clock) => <Dashboard clock={clock} />}   {/* non-null; unmounts when Clock goes */}
</Requires>

// yatoi: UI a plugin pushes into a surface it doesn't own
<Slot name="sidebar.item" collapsed={collapsed} />   {/* host never imports the contributors */}
```

`<Requires>` is spatial composability in the render tree. `<Slot>` is
where both meet: a contribution is a reversible effect (it disappears with
its plugin) that the host reads reactively.

> **Never mutate the kernel during render.** `kernel.load`, `unload`,
> `provide`, `contribute` belong in event handlers, effects, or outside
> React entirely. Concurrent rendering can discard a render tree; plugin
> loading is not rollback-able. There is no runtime guard — this is the one
> rule you carry yourself.



## Inspired by Cordis

The two properties are from *A Programming Paradigm for Spatiotemporal
Composability* (Shi, Zhang, Cui — [arXiv:2608.25512](https://arxiv.org/abs/2608.25512))
and its reference implementation, [Cordis](https://github.com/cordiverse/cordis),
which powers DeepSeek Harness. yatoi keeps the vocabulary — effects,
inject, scope — and takes no dependency on it.

The difference is who owns the runtime. Cordis owns its own; React's
scheduler can discard a render mid-flight and must never observe a
half-done plugin. So the kernel does all its async behind a synchronous
facade: disposers are *invoked* synchronously, only their promises are
awaited, and React reads a snapshot (`present | absent | loading`) through
`useSyncExternalStore` that can't tear. That constraint is the design work
here, and the reason the kernel is small rather than a port.

## Why now

What an app is made of is stopping being a build-time decision. Marketplaces
let users install capabilities. Products ship a core and let customers
override pieces of it. And agents are the extreme case: they install
tools, generate views, and remove them again, with no app author in the
loop. Every one of those needs removal to be *total* and activation to be
*reactive to what is actually present* — the two properties above. The
alternative is a page reload, and agents don't reload pages.

The example in this repo is a todo app with a calendar plugin installed
and uninstalled from a marketplace page. Its second chapter delivers that
same plugin as a separately built ESM file, fetched by URL at runtime —
the host never imports it.

## Why not…

**…context and** `lazy()`**?** Context is a read: nothing deactivates when a
provider goes away. `lazy()` loads code; nothing reverts it. That's the
temporal half for render-tree nodes only, and no spatial half. It is the
right tool right up until something has to be removable.

**…Module Federation or single-spa?** Those are delivery and isolation —
and they deliberately avoid shared lifecycle, because team independence
was the goal. Neither property, on purpose. yatoi is the layer that goes
on top when the pieces *do* need to compose.

**…build it in-house, like VS Code?** VS Code's `DisposableStore` and
service decorators are the temporal half done right and part of the
spatial half. Every large extensible React app rebuilds that core, and
none extracts it, because the interesting part — the contribution surface
— is always app-shaped. yatoi is the ~1,000 lines you'd write anyway,
extracted, with the React bridge tested under StrictMode on a concurrent
root so you don't have to discover the double-invoke bugs yourself.

## Packages


| Package                            | What                                                                                                 | React? |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| [`@yatoi/kernel`](packages/kernel) | Plugins, services, scope tree, cascade unload. Runs in plain Node — no DOM, enforced at compile time | No     |
| [`@yatoi/react`](packages/react)   | `<KernelProvider>`, `useService`, `<Requires>`, `usePlugin`, `useContributions`                      | Yes    |
| [`@yatoi/slots`](packages/slots)   | Typed contribution points: `contribute()`, `<Slot>`                                                  | Yes    |


Stop at the layer you need. A shell developer drives the kernel from
config and unit-tests it without rendering anything. An app developer
writes `usePlugin` and `<Slot>` and never touches the kernel. If either of
those stops being true, the API is wrong.

## The honest cost

`inject` + `provides` is a second dependency graph alongside the import
graph, and it is only legible at runtime. That is the price of the spatial
half — late binding is what makes activation derivable, and what makes it
invisible to your bundler. The kernel keeps its state inspectable
(`pluginState`, `state`, `on('error')`) to pay some of it back; a devtools
package is the rest.

## Status

v0.1 is implemented and tested — 65 tests, the kernel's in plain Node, the
React layer's under `<StrictMode>` on a concurrent root, plus a torture
test for a service that unloads while dependents are mid-async. Not yet
on npm; clone it and run the example.

What's next — devtools, Suspense integration, token versioning, a Dart
implementation for Flutter — and what's deliberately not planned is in
[ROADMAP.md](ROADMAP.md). [CONTRIBUTING.md](CONTRIBUTING.md) is the short
version of how to help; [AGENTS.md](AGENTS.md) is the long one.

## Documentation

- [Concepts](docs/concepts.md) — the mental model in one sitting: tokens,
plugins, scopes, cascade unload, the two mounting modes, slots vs.
collections.
- [Guide](docs/guide.md) — how to do each thing, with snippets.
- [Pitfalls](docs/pitfalls.md) — the ways this bites, and why.
- [Architecture](docs/architecture.md) — how the code implements the
design; read before changing the library.
- [Design brief](docs/design.md) — what we're building, what we're not,
and why each decision went the way it did.
- [Protocol spec](docs/spec.md) — the language-neutral contract a kernel
and binding must satisfy; what a port to another language is built
against.
- [Example app](examples/todo/README.md) — todo + an installable calendar
plugin, exercising all three packages end to end; chapter 2 loads the
plugin from another origin.



## Development

Node ≥ 20, pnpm 9 (`packageManager` is pinned).

```bash
pnpm install
pnpm test          # all packages; kernel in node, react/slots in jsdom under StrictMode
pnpm typecheck
pnpm build         # tsc -b → dist/ in each package
pnpm --filter yatoi-example-todo dev   # the example app; see its README
```

See the example README's [chapter
2](examples/todo/README.md#chapter-2--the-same-plugin-delivered-as-a-file)
for loading the calendar plugin from another origin, the way a plugin from
a CDN would arrive.

Tests and the example resolve `@yatoi/*` straight to source, so no build
step sits in the inner loop. Commit conventions are in
[AGENTS.md](AGENTS.md#commit-conventions).
