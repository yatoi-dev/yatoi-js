# Contributing

Thanks for looking. Three documents do most of the work here:

- **[AGENTS.md](AGENTS.md)** — how to work in this repo: layout, commands,
  the hard rules that are load-bearing, code style, and what a public API
  change must touch. It's written for coding agents and humans alike;
  read it first.
- **[ROADMAP.md](ROADMAP.md)** — what's wanted, what's later, and what
  isn't planned. Check it before starting anything larger than a fix, and
  open an issue first for anything not on it.
- **[docs/design.md](docs/design.md)** — why things are the way they are.
  Read it before proposing architecture, not before fixing a typo.
- **[docs/proposals/](docs/proposals/README.md)** — for anything that
  would change the protocol or has to be solved in every implementation.
  Start from the template; discussion happens on the PR.

## Quick start

```bash
pnpm install
pnpm test        # all packages
pnpm typecheck
pnpm --filter yatoi-example-todo dev
```

## Before opening a PR

- Tests pass, typecheck is clean, and — if you touched a package —
  `pnpm build` still emits.
- A behavioural change updates [docs/spec.md](docs/spec.md) *first*, then
  tests, then code; a surface change updates [docs/guide.md](docs/guide.md)
  and the API sketch in design.md. Same commit.
- React changes are tested under `<StrictMode>` on a concurrent root.
  Kernel changes never import DOM or Node types.
- Commit messages: imperative subject ≤ 72 chars, body says *why*, no AI
  attribution trailers. Details in
  [AGENTS.md § Commit conventions](AGENTS.md#commit-conventions).

## Reporting a bug

A failing test is the best report. For the kernel, a plain-Node
reproduction in the style of `packages/kernel/test/kernel.test.ts`; for
the React layer, one that renders under `<StrictMode>`. If you can't get
that far, the plugin definitions involved and the sequence of
`load`/`unload` calls is enough.
