# yatoyi

A plugin kernel for React: **reversible effects, typed service discovery,
and reactive dependency unload** — implemented against React's scheduler
rather than fighting it. Build fully plugin-based frontends without giving
up normal React productivity.

> **Never mutate the kernel during render.** `kernel.load`, `unload`,
> `provide`, `contribute` belong in event handlers, effects, or outside
> React entirely. Concurrent rendering can discard a render tree; plugin
> loading is not rollback-able. There is no runtime guard — this is the one
> rule you have to carry yourself.

## In thirty seconds

```ts
const Clock = defineService<{ now(): number }>('clock')

const clockPlugin = definePlugin({
  name: 'clock',
  provides: [Clock],
  setup(scope) {
    const id = setInterval(tick, 1000)
    scope.defer(() => clearInterval(id))            // undone on unload
    scope.provide(Clock, { now: () => Date.now() })
  },
})

const syncPlugin = definePlugin({
  name: 'sync',
  inject: [Clock],                                  // runs only while Clock is present
  setup(scope) { scope.defer(subscribe(scope.get(Clock))) },
})

kernel.load(clockPlugin, syncPlugin)
kernel.unload(clockPlugin)   // sync disposes first, cleanups in reverse; reload and it comes back
```

```tsx
<Requires of={[Clock]} fallback={<Spinner />}>
  {(clock) => <Dashboard clock={clock} />}       {/* non-null; subtree unmounts if Clock goes */}
</Requires>

<Slot name="sidebar.item" collapsed={collapsed} />  {/* plugins contribute; host never imports them */}
```

## Packages

| Package | What | React? |
|---|---|---|
| [`@yatoyi/kernel`](packages/kernel) | Plugins, services, scope tree, cascade unload. Runs in plain Node — no DOM, by compile-time enforcement. | No |
| [`@yatoyi/react`](packages/react) | `<KernelProvider>`, `useService`, `<Requires>`, `usePlugin`, `useContributions` | Yes |
| [`@yatoyi/slots`](packages/slots) | Typed contribution points: `contribute()`, `<Slot>` | Yes |

Stop at the layer you need. The kernel is unit-testable without rendering
anything; the React layer only ever observes it.

## Documentation

- [Concepts](docs/concepts.md) — the mental model: tokens, plugins, scopes,
  cascade unload, the two mounting modes, slots vs. collections.
- [Guide](docs/guide.md) — how to do each thing, with snippets.
- [Pitfalls](docs/pitfalls.md) — the ways this bites, and why.
- [Architecture](docs/architecture.md) — how the code implements the
  design; read this before changing the library.
- [Design brief](docs/design.md) — what we're building, what we're not,
  and why each decision went the way it did.
- [AGENTS.md](AGENTS.md) — working in this repo: layout, commands, hard
  rules, conventions.
- [Example app](examples/todo/README.md) — a todo app with an installable
  calendar plugin, exercising all three packages end to end.

## The honest cost

`inject` + `provides` is a second dependency graph alongside the import
graph, and it is only legible at runtime. That is the tax for late
binding. The kernel keeps its state inspectable (`pluginState`, `state`,
`on('error')`) to pay some of it back; a devtools package is the rest.

## Development

Node ≥ 20, pnpm 9 (`packageManager` is pinned).

```bash
pnpm install
pnpm test          # all packages; kernel in node, react/slots in jsdom under StrictMode
pnpm typecheck
pnpm build         # tsc -b → dist/ in each package
pnpm --filter yatoyi-example-todo dev
```

Tests and the example resolve `@yatoyi/*` straight to source, so no build
step sits in the inner loop. Commit conventions are in
[AGENTS.md](AGENTS.md#commit-conventions).
