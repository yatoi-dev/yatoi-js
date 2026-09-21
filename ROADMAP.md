# Roadmap

Where yatoi is going, in tiers rather than dates — there is no team or
release cadence to promise against. *Last reviewed: 2026-09-21.*

How something gets onto this list: an issue describing the need; for
anything that changes the protocol or must be solved in every
implementation, a [proposal](docs/proposals/README.md); a decision
recorded in [docs/design.md](docs/design.md); then an entry here.

Items marked **pick-up-able** have enough design behind them that a
contributor can start without a discussion first; read
[AGENTS.md](AGENTS.md) and the linked sections before you do.

## Now — v0.1, done

Five packages (`@yatoi/kernel`, `@yatoi/react`, `@yatoi/slots`,
`@yatoi/vue`, `@yatoi/vue-slots`), the todo example with its two
chapters, developer docs, and the [protocol spec](docs/spec.md). 95
tests: the kernel in plain Node, the React layer under `<StrictMode>` on
a concurrent root, the Vue layer asserting unmount/remount explicitly
(Vue has no StrictMode), plus the torture case. A second JS binding
(Vue) landed here rather than in *Later* — it reuses `@yatoi/kernel`
unchanged, which is the proof that the layering is real rather than
convenient for React. Not yet published. Also done: an
[agent-host example](examples/agent-host/README.md), a Node program with
no React and no DOM where skills are plugins, tools/prompt/middleware are
collections read fresh each turn, and revoking a credential cascades a
skill's tools out before the model's next turn.

## Next — v0.2

- **Publish `@yatoi/*` to npm.** The scope is free; the manifests carry
  `repository`/`homepage`/`bugs`. Needs: a changeset or release
  workflow, `files`/`exports` verified against a fresh install, and the
  design brief's repo description and topics set once the repo is public.
- **`/devtools`** — *pick-up-able.* A graph inspector (plugins, what they
  provide and inject, current states) and "why did this unload" traces
  built from the cascade order. The [honest cost](README.md#the-honest-cost)
  is why this is optional in the package list but not in practice. Design
  constraint: observe through `subscribe`/`state`/`pluginState` only;
  anything the devtools need that isn't exposed is a kernel API question
  first.
- **Suspense integration** — *pick-up-able.* The kernel exposes
  `loading` (spec §9.4); the React layer doesn't use it. Likely shape: a
  `useServiceSuspense` that throws a promise resolved on the next
  `present`/`absent` transition, sitting beside `<Requires>` rather than
  replacing it.
- **Token versioning** for third-party plugins across breaking changes —
  [proposal 0002](docs/proposals/0002-token-versioning.md), draft. Leaning
  towards a key convention plus adapter plugins now, kernel-level version
  matching only if a real marketplace needs it. Matters once plugins ship
  separately, so it sequences with publishing.
- **Conformance scenarios as data.** Spec §15's scenarios expressed as
  JSON (load/unload sequences with expected observable states) so every
  implementation runs the same suite. Worth doing when the second
  implementation exists, not before.

## Later

- **`yatoi-dart`** — the Dart kernel and Flutter binding, as a sibling
  repo under `yatoi-dev`, built against the spec. Spec §16 sketches the
  mapping. Blocked on nothing now; sequenced after v0.2 publishing so the
  JS side is stable while it's being ported.
- **A Solid binding.** Cheaper now than Vue was: the pattern (typed
  signature over an untyped implementation for anything generic, a
  tearing-safe read tied to the framework's own subscription primitive)
  is established, and Solid's fine-grained signals are, if anything, a
  closer match to `kernel.subscribe` than Vue's component-level
  reactivity was. The next proof, not the first one.
- **Namespace isolation** — per-scope resolution of a token, so two
  instances of the same plugin set can be live at once (split views,
  multiple workspaces). [Proposal 0001](docs/proposals/0001-namespace-isolation.md),
  draft. Large: it makes lookup, activation and cascade path-relative and
  gives bindings a scope in context. Workarounds exist and are listed
  there; the agent platform's multi-workspace case is what will force it.
- **Declarative contributions** — contributions as data the host
  renders, plus a commands collection for interactivity.
  [Proposal 0003](docs/proposals/0003-declarative-contributions.md), draft.
  What makes plugins dynamic on platforms with no runtime code (Dart
  AOT), lets agents add UI safely, and lets a manifest contribute a menu
  item before its code loads. Sequences with `yatoi-dart`.
- **Move the spec and proposals to `yatoi-dev/spec`** once two
  implementations cite them.

## Only if asked

- **`/loader`** — manifests, lazy activation, remote loading, isolation as
  a package. The example already does all of this in ~60 lines
  (`registry.ts`, the `VITE_PLUGIN_BASE` seam, the import-map plugin),
  and the design brief's position is to resist extracting it until an
  issue shows what a second app needs that the first didn't. Please
  don't open a PR for this without that issue.

## Not planned

Each of these has a good existing answer, and the README's
["Why not…"](README.md#why-not) explains where yatoi sits relative to it:

- State management (bring Jotai, Zustand, signals — a service can hold
  any of them).
- Routing, data fetching, or any other app-framework concern.
- Build tooling or a plugin bundler.
- Module federation / micro-frontend isolation — those are delivery
  concerns; yatoi is the composition layer above them.
- Isolation between plugins in the *security* sense — sandboxing
  untrusted code in a separate realm. Incompatible with host-rendered
  contributions by construction; see proposal 0001 "Not this". (Namespace
  isolation, the other meaning, is under *Later*.)

## Recently resolved

Kept briefly so the history is visible without reading git log.

- Service-absence policy → `<Requires>` (design.md decision 1).
- Slot resolution modes → `append` / `replace` / `wrap` (decision 2).
- Token location → both forms; imported tokens are the default,
  `service(key)` for third parties (decision 4).
- Cross-bundle identity → by key, tested (spec §2.2).
- Name → `yatoi`, org `yatoi-dev`, repo `yatoi-js`.
