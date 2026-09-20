# yatoyi

A plugin kernel for React: reversible effects, key-based service discovery,
and reactive dependency unload — implemented against React's scheduler
rather than fighting it. See [CLAUDE.md](CLAUDE.md) for the full design
brief and rationale.

## Packages

| Package | Contains | Depends on React? |
|---|---|---|
| [`@yatoyi/kernel`](packages/kernel) | Scope tree + disposer stack, typed token registry, dependency graph with cascade unload/reload | No |
| [`@yatoyi/react`](packages/react) | `<KernelProvider>`, `useService`, `<Requires>`, `usePlugin` | Yes |
| [`@yatoyi/slots`](packages/slots) | Typed contribution points, `<Slot>`, resolution policy | Yes |

`@yatoyi/kernel` is plain TypeScript, testable in Node with no DOM (its
`tsconfig.json` sets `types: []`, so any DOM or Node global is a compile
error). `@yatoyi/react` and `@yatoyi/slots` build on it and require React 18 or
19.

## Requirements

- Node >= 20
- pnpm 9 (the repo pins `packageManager: pnpm@9.15.9`)

## Setup

```bash
pnpm install
```

This is a pnpm workspace (`pnpm-workspace.yaml`) covering `packages/*` and
`examples/*`.

## Running the tests

```bash
pnpm test          # vitest run, once, across all packages
pnpm test:watch    # vitest, watch mode
```

Tests are split into per-package vitest projects (`vitest.config.ts`):
`kernel` runs under the plain `node` environment (no DOM), `react` and
`slots` run under `jsdom`. Cross-package imports resolve straight to each
package's `src/index.ts` via alias, so tests never depend on a prior build.

Run a single package's tests from its own directory, e.g.:

```bash
pnpm --filter @yatoyi/kernel test
```

## Type checking and building

```bash
pnpm typecheck   # tsc --noEmit in every package, in parallel
pnpm build       # tsc -b in every package, emitting dist/
pnpm clean       # remove every package's dist/
```

## Example app

[`examples/todo`](examples/todo/README.md) is a small todo app with an
installable calendar plugin that exercises `@yatoyi/kernel`, `@yatoyi/react`,
and `@yatoyi/slots` end to end. From the repo root:

```bash
pnpm install
pnpm --filter yatoyi-example-todo dev
```

See its own README for what each part of the example demonstrates.

## Design rules worth knowing before contributing

- **Never mutate the kernel during render.** Kernel mutations belong in
  event handlers, effects, or outside React entirely — concurrent
  rendering can discard a render tree, and plugin loading is not
  rollback-able.
- **Async unload behind a sync facade.** The kernel owns async; React only
  ever observes a synchronous snapshot (`present | absent | loading`) via
  `useSyncExternalStore`.

Full rationale for both, plus the rest of the settled design decisions, is
in [CLAUDE.md](CLAUDE.md).
