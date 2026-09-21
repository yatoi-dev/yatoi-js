# 0001 — Namespace isolation: per-scope resolution of a token

**Status:** draft · **Opened:** 2026-09-21 · **Issue:** —

## Problem

The registry is flat. One provider per key, and every plugin in the
kernel sees the same value ([spec §10.4](../spec.md), §2.2). That is
right for singletons — a clock, a socket, the app's store — and it is
what makes cascade unload simple.

It cannot express **two live instances of the same plugin set**. As soon
as a host wants two of something — two documents, two workspaces, two
todo lists side by side — with plugins attached to *each*, the second
provider of the shared token fails, and `inject: [Todos]` has no way to
say *which* `Todos`.

The vocabulary `isolate` is reserved for this in the design brief;
nothing is designed. This proposal is about the design, not sandboxing —
see "Not this" below.

## Motivating scenarios

1. **Split view.** The todo example grows a second list. Each list has
   its own `Todos` store. The calendar plugin, installed into list A,
   contributes its due-date field to list A's rows only and reads list A's
   store. Installing it into list B as well yields a second, independent
   calendar.
2. **Multiple workspaces in the agent platform.** Each workspace is a
   scope providing `Workspace`, `Agents`, `Storage`. An agent plugin
   loaded inside a workspace resolves *that* workspace's services.
   Unloading a workspace cascades only to its own plugins.
3. **Tests.** A test harness loads the same plugin graph twice in one
   kernel with different fakes for `Clock`, and asserts on each in
   isolation.
4. **Slot scoping.** In scenario 1, a `todo.item.extra` contribution made
   by the calendar inside list A must not render in list B's rows.

## Design sketch

Make resolution **path-relative**. A scope may declare tokens it
*isolates*; for those tokens its subtree resolves against the scope's own
namespace instead of the kernel's.

```ts
const listPlugin = definePlugin({
  name: 'todo-list',
  isolate: [Todos],                 // this subtree gets its own Todos
  provides: [Todos],
  setup(scope) {
    scope.provide(Todos, createStore(scope.id))
    scope.load(calendarPlugin)      // resolves Todos → this scope's
  },
})

kernel.load(listPlugin)            // list A
kernel.load(listPlugin)            // list B — currently an error (§5.4); see open question 1
```

Semantics, relative to the current spec:

- **Lookup.** `get(token)` from a scope walks up the scope tree; the first
  ancestor (or self) that *isolates* the token owns the namespace for it.
  Tokens nobody isolates resolve at the kernel root — today's behaviour,
  unchanged.
- **Provide.** `provide(token)` publishes into the nearest isolating
  ancestor's namespace, or the root. "One provider per key" (§10.4) holds
  *per namespace*.
- **Activation.** "Deps present" (§5.1) means present along *my* path.
- **Cascade.** Withdrawing a value cascades to dependents *in that
  namespace's subtree* only (§8.3, scoped).
- **State.** `state(token)` and `loading` (§9.4) become questions asked
  from a scope. The kernel-level `kernel.get/state` read the root
  namespace.
- **Collections and slots.** The same rule applied to collection tokens
  gives scenario 4: a contribution made inside list A's namespace is
  listed by `list()` asked from within A. Whether isolation of a slot is
  declared by the host (`isolate: [slot('todo.item.extra')]`) or is
  implied by isolating the services it depends on is open.
- **Bindings.** `useService` / `<Requires>` / `<Slot>` need a *scope* in
  context, not just a kernel. A `<ScopeProvider scope={…}>` (or the
  component-scoped plugin's own scope) supplies it; absent one, the root.

What stays unchanged: tokens, identity by key, the state machine, LIFO
disposal, the sync facade, error containment. The change is *where* the
registry lookup starts, not what it does.

## Spec impact

- §2.2 — identity is still by key, *within a namespace*; add the
  namespace concept.
- §4 — `get`/`state`/`list` gain an optional scope argument; new
  `isolate` field on plugins (§3.1).
- §5.1, §5.4 — "present" and "already registered" become path-relative.
  §5.4 needs a decision (open question 1).
- §6 — `scope.get` walks the path; new `scope.namespace` or equivalent
  for bindings.
- §8.3 — cascade is bounded by namespace.
- §9.4 — `loading` computed per namespace.
- §10.4 — single provider per namespace.
- §13 — bindings must read from a scope; new "scope provider" construct.
- §15 — new conformance scenario: two isolated subtrees, unload one,
  the other untouched.

## Alternatives and workarounds

- **Distinct keys per instance.** `defineService<TodoStore>(\`todos:${id}\`)`
  and load per-instance plugins with tokens built for that id. Works
  today with no library change. Cost: every participating plugin must be
  constructed per instance and know the id; the type system can't help.
- **A registry service.** One global `TodoLists` service that hands out
  instances by id; plugins ask it. Works today. Cost: the "which
  instance" question moves into every consumer; cascade no longer
  tracks the instance's lifetime.
- **One kernel per instance.** Spin up a kernel per list. Works today.
  Cost: nothing global is shared (clock, auth, theme) without duplicating
  it or bridging kernels; React needs nested `KernelProvider`s.
- **Do nothing.** Acceptable until the agent platform's multi-workspace
  case lands; the first two workarounds cover the todo example.

## Open questions

1. **Same plugin, two registrations at the same level** (§5.4 says
   error). Scenario 1 needs two `listPlugin` loads. Options: allow when
   the plugin declares `isolate` (each load is its own namespace);
   require a factory (`listPlugin(id)`) so identities differ; or a
   `kernel.load(plugin, { key })`. The factory route keeps §5.4 intact
   and is the least surprising.
2. **Who declares slot isolation** — host or plugin (see sketch).
3. **Root reads.** Should `kernel.get(token)` for an isolated token
   return the root value, error, or require a scope? Erroring is safest;
   bindings always have a scope.
4. **Devtools.** The graph inspector must show namespaces; this proposal
   should land before or with `/devtools`, not after.

## Not this

Isolation in the *security* sense — running untrusted plugin code in a
separate realm with capability-restricted proxies — is a different
problem and is not proposed. Fault containment for honest bugs already
exists (§10). Contributed UI being a host-rendered component is
incompatible with realm isolation by construction; that would be a
different product.

## Implementation status

| Implementation | Status | Tracking |
|---|---|---|
| yatoi-js | — | |
| yatoi-dart | — | |
