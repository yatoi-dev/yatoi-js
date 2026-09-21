# Working in this repo

Instructions for coding agents and humans. `CLAUDE.md` imports this file;
edit here. The design rationale is in [docs/design.md](docs/design.md) —
read it before proposing architecture, not before fixing a typo.

## What this is

**yatoi** — a plugin kernel for React: reversible effects, typed service
discovery, cascade unload. Three packages, layered; a React example app.
v0.1 is implemented and tested. Not yet published.

## Layout

```
packages/kernel/          @yatoi/kernel   plugins, services, scope tree, cascade unload   no React, no DOM
packages/react/           @yatoi/react    KernelProvider, useService, <Requires>, usePlugin
packages/slots/           @yatoi/slots    contribute(), <Slot>, Slots augmentation
examples/todo/            yatoi-example-todo   Vite app: todo + installable calendar plugin,
                           chapter 1 in one `pnpm dev`; chapter 2 delivers the same plugin as a
                           separately built file, opt-in (see examples/todo/README.md)
docs/                     concepts, guide, pitfalls, architecture, design, spec
```

Each package: `src/` (source), `test/` (vitest), `tsconfig.json`
(typecheck), `tsconfig.build.json` (emit to `dist/`).

## Commands

Run from the repo root. pnpm 9, Node ≥ 20.

```bash
pnpm install
pnpm test                                  # all packages
pnpm test -- --project kernel              # one package: kernel | react | slots
pnpm typecheck                             # every package, in parallel
pnpm build                                 # tsc -b, topological
pnpm --filter yatoi-example-todo dev          # example on :5173 (also .claude/launch.json → todo-example)
pnpm --filter yatoi-example-todo dev:remote   # same app, calendar plugin loaded from :5174 instead of bundled
pnpm --filter yatoi-example-todo build        # tsc --noEmit && vite build
pnpm --filter yatoi-example-todo serve:plugin # builds + serves the calendar plugin on :5174 (also .claude/launch.json → todo-plugin-cdn)
```

Tests and the example alias `@yatoi/*` to `packages/*/src`, so no build
is needed in the inner loop. Typechecking `react`/`slots` goes through
`tsc -b` with project references, so each builds `kernel` first itself.

Chapter 2 of the example needs both servers running, to demonstrate the
loaded-by-URL plugin: `todo-plugin-cdn` (:5174, serves `calendar.js`) and
`todo-example-remote` (:5173, the host in remote mode). Chapter 1 needs
just one — `todo-example` — the calendar plugin ships bundled with the
app. See `examples/todo/README.md`.

## Hard rules

These are load-bearing. Don't relax them without changing
[docs/design.md](docs/design.md) first.

1. **`@yatoi/kernel` has no DOM and no Node types.** Its `tsconfig.json`
   sets `lib: ["ES2022"]`, `types: []`. `document`, `window`, `setTimeout`
   are compile errors there. `console` is declared minimally in
   `globals.d.ts`. Keep it that way.
2. **Never mutate the kernel during render.** In library code, tests, docs
   and the example: `kernel.load/unload`, `scope.provide/contribute` only
   in event handlers, effects, or bootstrap. There is no runtime guard.
3. **The three packages stay separate.** Don't merge them, don't make
   `kernel` import from `react` or `slots`.
4. **The kernel stores opaque values.** It never learns a value is a React
   component. React meaning is added in `slots`.
5. **All React tests run under `<StrictMode>` on a concurrent root.** If a
   change doesn't survive double-invoke, the change is wrong.
6. **Don't add `/loader` or `/devtools`** until someone files an issue.
   The example's manifest + `examples/todo/src/plugins/registry.ts` (id →
   `import()`), plus the `VITE_PLUGIN_BASE` seam in
   `examples/todo/src/marketplace/useMarketplace.ts` for loading the same
   ids from another origin, is all the loader v0.1 needs.
7. **TypeScript stays on 5.9.** 6.x changed defaults, 7.x is the native
   compiler; upgrading is a deliberate task, not a side effect.

## When you change public API

Same commit, every time:

- Update `docs/guide.md` (usage) and the API sketch in `docs/design.md`.
- If the change alters *behaviour* (not just surface), update
  `docs/spec.md` first — it is normative; the tests follow it.
- Add or update a test. Kernel tests in Node; React tests under StrictMode.
- If the change affects how plugins are written, check
  `examples/todo` still typechecks and builds.

The torture test (`packages/kernel/test/torture.test.ts`) must keep
passing; it encodes the sync-facade guarantee.

## Code style

- TypeScript strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- No `any` except where `Scope<any>` is forced at a generic boundary.
- Comments explain *why*, tersely. Match the density of the surrounding
  file — the kernel is doc-comment heavy in `types.ts` and sparse elsewhere.
- Prefer `<Requires>` over `useService(...)!` in every example and doc.
- Tokens are imported symbols, never string literals at call sites.

## Commit conventions

- Imperative subject, ≤ 72 chars, no trailing period. Body says *why* and
  what changed at the level of behaviour, not files.
- **No AI attribution trailers** — no `Co-Authored-By: <assistant>`, no
  "Generated with …", whichever tool wrote the message. Claude Code users:
  `.claude/settings.json` is gitignored, so set locally
  `{ "attribution": { "commit": "", "pr": "" } }`.
- Commit only when asked. Don't push; there is no remote yet.

## Where to look

| Question | Answer lives in |
|---|---|
| How does X work / why is it shaped this way | [docs/architecture.md](docs/architecture.md), then [docs/design.md](docs/design.md) |
| How do I use X | [docs/guide.md](docs/guide.md) |
| Known footguns | [docs/pitfalls.md](docs/pitfalls.md) |
| Real usage, end to end | [examples/todo](examples/todo/README.md) |
| What the kernel guarantees | [docs/spec.md](docs/spec.md) (normative), pinned by `packages/kernel/test/kernel.test.ts` (numbered semantics) and `torture.test.ts` |
| Slot resolution semantics | `packages/slots/test/slots.test.tsx` |

## Known gaps (don't be surprised)

- No render-time-mutation guard; documented instead.
- No Suspense integration; `useServiceState` exposes `loading` if needed.
- No token versioning story for third-party plugins across breaking
  changes (design.md open decision 3).
- GitHub org / domain / trademark for the name are unchecked.
