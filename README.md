# yatoi

[![CI](https://github.com/yatoi-dev/yatoi-js/actions/workflows/ci.yml/badge.svg)](https://github.com/yatoi-dev/yatoi-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@yatoi/kernel.svg)](https://www.npmjs.com/package/@yatoi/kernel)
[![license](https://img.shields.io/github/license/yatoi-dev/yatoi-js.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

**Plugins that come apart cleanly.** A small kernel for any modern
JavaScript runtime with the two properties a plugin system needs — remove
a plugin and *everything it did is undone*; a plugin runs *only while what
it needs exists* — and React and Vue bindings that only ever observe it.

A **yatoi** is the loose tenon in Japanese joinery: a separate piece,
belonging to neither board, cut to fit slots in both and inserted to hold
them together. Literally, a hired hand. It carries load without being
glued in place, and the joint comes apart without damaging either side.
yatoi provides the slots, the fit, and the guarantee that pulling a piece
out leaves nothing behind.

## The problem

Composition breaks when what an app is made of stops being a build-time
decision. Two things go wrong:

- **A parent must import its children.** In React or Vue, nothing can add
UI to a surface it doesn't own. Outside a component tree, the same
coupling is a host hard-coding its agent's tool list or server's route
table.
- **Nothing is required, only read.** React context, Vue
`provide`/`inject`, and conventional DI resolution expose values to
consumers; they do not treat a disappearing dependency as an event that
deactivates each dependent and reverses its effects. Consumers keep a
stale or absent reference instead.

Add a third, quieter one: long-lived things that aren't UI — sockets,
schedulers, agent runners — need a lifecycle that can be reversed. The
[agent-host](examples/agent-host/README.md) and
[server](examples/server/README.md) examples exercise exactly that.

## Two properties

The paper behind [Cordis](#inspired-by-cordis) names the two properties a
system needs before components can be added and removed at runtime
without disturbing each other. In plain words:


|              | What it means                                   | yatoi                                                                                                                                                         | Elsewhere                                                                                                                                                                                    |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Temporal** | Remove a plugin and everything it did is undone | Every effect a plugin makes through its scope — `defer`, `provide`, `contribute` — carries its inverse, which the kernel holds and runs in reverse on dispose | `useEffect`/`onUnmounted` cleanup follows component lifecycle, not dependency availability; DI containers dispose a whole scope, not an individual dependency edge                           |
| **Spatial**  | A plugin runs only while what it needs exists   | `inject` declares requirements; activation is *derived* from what's present, and pulling a requirement unloads every dependent, in dependency order           | None. Context, `provide`/`inject`, and `resolve()` are reads, not requirements                                                                                                                |


Together the paper calls this **spatiotemporal composability**. UI
frameworks have the temporal half for render-tree nodes; DI containers
have it for whole scopes. Neither has the spatial half. yatoi adds both —
as a kernel that knows nothing about any framework, with React and Vue
subscribed to it.

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

The same two properties, projected into a render tree (React shown; Vue
provides the equivalent behavior — see [the guide](docs/guide.md)):

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
> the UI framework entirely. React's concurrent rendering and Vue's flush
> queue can observe work between steps; plugin loading is not rollback-able.
> There is no runtime guard — this is the one rule you carry yourself. In a
> non-UI host, the same rule reads: mutate between turns or requests, never
> inside one.



## Inspired by Cordis

The two properties are from *A Programming Paradigm for Spatiotemporal
Composability* (Shi, Zhang, Cui — [arXiv:2608.25512](https://arxiv.org/abs/2608.25512))
and its reference implementation, [Cordis](https://github.com/cordiverse/cordis),
which powers DeepSeek Harness. yatoi keeps the vocabulary — effects,
inject, scope — and takes no dependency on it.

The difference is who owns the runtime. Cordis owns its own; UI schedulers
— React's concurrent renderer, Vue's flush queue — can observe state
between two steps of an update, and a Node host reading the kernel between
turns must not see a half-done plugin either. So the kernel does all its
async behind a synchronous facade: disposers are *invoked* synchronously,
only their promises are awaited, and every observer reads a synchronous
snapshot that can't tear — `useSyncExternalStore` in React, `shallowRef`
in Vue, direct `kernel.state` / `get` / `list` reads in Node — with service
state explicit as `present | absent | loading`. That constraint is the
design work here, and the reason the kernel is small rather than a port.

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

The other examples are a Vue port, a Node agent host whose tools cascade
out when a credential is revoked, and a `node:http` server whose routes
follow its database connection. The latter two use the same kernel with
no UI.

## Why not…

**…framework context and lazy loading?** React context and Vue
`provide`/`inject` are reads: nothing deactivates when a provider goes
away. `lazy()` / `defineAsyncComponent` load code; nothing reverts it.
That's the temporal half for render-tree nodes only, and no spatial half.
They are the right tools right up until something has to be removable.

**…a DI container?** A container answers *how to build* an object graph;
yatoi answers *when things exist*. Conventional containers resolve values
and dispose scopes — they do not notify and deactivate each dependent when
one dependency goes away, or expose `loading` / `absent` as first-class
states. They compose: one kernel scope, one container scope. See
[Beyond UI](docs/beyond-ui.md).

**…Module Federation or single-spa?** Those are delivery and isolation —
and they deliberately avoid shared lifecycle, because team independence
was the goal. Neither property, on purpose. yatoi is the layer that goes
on top when the pieces *do* need to compose.

**…build it in-house, like VS Code?** VS Code's `DisposableStore` and
service decorators are the temporal half done right and part of the
spatial half. Every large extensible app rebuilds that core, and
none extracts it, because the interesting part — the contribution surface
— is always app-shaped. yatoi is the ~1,000 lines you'd write anyway,
extracted, with the React bridge tested under StrictMode on a concurrent
root and the Vue bridge asserting unmount/remount explicitly so you don't
have to discover the lifecycle bugs yourself.

## Packages


| Package                                    | What                                                                                                                   | Runs in              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------- |
| [`@yatoi/kernel`](packages/kernel)         | Plugins, services, scope tree, cascade unload; no framework, DOM, or Node APIs                                         | Any modern JS runtime |
| [`@yatoi/react`](packages/react)           | `<KernelProvider>`, `useService`, `<Requires>`, `usePlugin`, `useContributions`                                        | React 18/19          |
| [`@yatoi/slots`](packages/slots)           | Framework-neutral slot contract: the `Slots` interface, `SlotName`, `SlotProps`, `slot()`                              | Any modern JS runtime |
| [`@yatoi/react-slots`](packages/react-slots) | React binding for `@yatoi/slots`: `contribute()`, `<Slot>`                                                           | React 18/19          |
| [`@yatoi/vue`](packages/vue)               | `provideKernel`/`<KernelProvider>`, `useService`, `<Requires>`, `usePlugin`, `useContributions`                        | Vue 3                |
| [`@yatoi/vue-slots`](packages/vue-slots)   | Vue binding for `@yatoi/slots`: `contribute()`, `<Slot>`                                                               | Vue 3                |


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

v0.1 is implemented and tested — 125 tests, the kernel's in plain Node, the
React layer's under `<StrictMode>` on a concurrent root, the Vue layer
asserting unmount/remount explicitly since Vue has no StrictMode, plus a
torture test for a service that unloads while dependents are mid-async.
`@yatoi/vue` and `@yatoi/vue-slots` are a second framework binding built
without changing `@yatoi/kernel` — the proof that the layering is real,
not just convenient for React. Not yet on npm; clone it and run the
example.

The first published version will be 0.1.0 for all six packages. After
that, patches are per package and minors move all six together: any
`0.1.x` binding works with any `0.1.x` kernel, and `0.2.0` on every
package means one new contract. While the major is 0, a **minor** may
break the public API or the spec and a **patch** never does — pin to
`~0.1.0` if that matters to you. 1.0 comes when the spec's conformance
table stops growing and a second implementation passes it. Release notes
are in [CHANGELOG.md](CHANGELOG.md); each package also carries its own
generated changelog.

What's next — devtools, Suspense integration, token versioning, a Dart
implementation for Flutter, a Solid binding — and what's deliberately not
planned is in [ROADMAP.md](ROADMAP.md). [CONTRIBUTING.md](CONTRIBUTING.md)
is the short version of how to help; [AGENTS.md](AGENTS.md) is the long
one.

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
plugin, exercising the kernel, React binding, and slots end to end;
chapter 2 loads the plugin from another origin.
- [Vue example app](examples/todo-vue/README.md) — the same app, chapter 1
only, ported to `@yatoi/vue` + `@yatoi/slots` + `@yatoi/vue-slots` — what a Vue plugin
author actually writes.
- [Agent-host example](examples/agent-host/README.md) — a Node program,
no React and no DOM, where skills are plugins and revoking a credential
cascades its tools out before the model's next turn.
- [Server example](examples/server/README.md) — a plain `node:http` host
where routes and jobs follow an async database capability and config reload.
- [Beyond UI](docs/beyond-ui.md) — how the same capability graph applies
to agent runtimes, long-running servers, and other non-UI hosts.
- [Release process](docs/releasing.md) — package contents, versioning,
tarball verification, and the npm publishing checklist.



## Development

Node ≥ 20, pnpm 9 (`packageManager` is pinned).

```bash
pnpm install
pnpm test          # all packages; kernel/slots in node, react/react-slots/vue/vue-slots in jsdom under StrictMode
pnpm typecheck
pnpm build         # tsc -b → dist/ in each package
pnpm pack:check    # build and audit the six npm tarballs without publishing
pnpm --filter yatoi-example-todo dev   # the example app; see its README
```

See the example README's [chapter
2](examples/todo/README.md#chapter-2--the-same-plugin-delivered-as-a-file)
for loading the calendar plugin from another origin, the way a plugin from
a CDN would arrive.

Tests and the example resolve `@yatoi/*` straight to source, so no build
step sits in the inner loop. Commit conventions are in
[AGENTS.md](AGENTS.md#commit-conventions).
