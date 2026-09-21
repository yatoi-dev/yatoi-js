# 0002 — Token versioning across breaking changes

**Status:** draft · **Opened:** 2026-09-21 · **Issue:** — · *design.md open decision 3*

## Problem

A token's key is its identity ([spec §2.2](../spec.md)). When the *type*
behind a key changes incompatibly — `TodoStore.patch` is renamed, a field
becomes required — every plugin built against the old shape still
resolves the key, activates, and fails at runtime, or worse, silently
misbehaves. Nothing in the protocol lets a provider say "this is `todos`
v2" or a consumer say "I need v1".

This matters only once plugins are built and shipped separately from the
host (the example's chapter 2, a marketplace). While everything compiles
together, TypeScript catches it.

## Motivating scenarios

1. **Host upgrade, old plugin.** The host ships `TodoStore` v2 (breaking).
   A calendar plugin built against v1 is installed. Expected: the plugin
   does not activate against the wrong shape, and the marketplace can say
   why ("requires todos v1; host provides v2").
2. **Transition period.** The host wants to provide *both* v1 and v2 for
   a release, so old plugins keep working while authors migrate.
3. **Plugin ahead of host.** A plugin requires `todos` v2; the host still
   provides v1. Expected: inactive with a legible reason, not a crash.
4. **Non-breaking change.** The host adds an optional method. Old plugins
   must keep activating; nothing should need to change.

## Design sketch — three candidates

**A. Version in the key.** `defineService<TodoStore>('todos@2')`. The
protocol is untouched; versioning is a naming convention the contract
package follows. Scenario 2 is natural (provide both keys). Cost: the
convention is invisible to the kernel — no "requires v1, have v2" message,
just `absent`; and every consumer must be rebuilt to move.

**B. Version as token metadata.** `defineService<TodoStore>('todos', { version: 2 })`
and `inject: [Todos.v(1)]` or a range. The kernel matches key *and*
compatible version, and `state()` can report `incompatible(provided: 2,
required: 1)` as a fourth status. Scenario 1 and 3 get their legible
reason. Cost: a new dimension in matching (§2.2, §5.1, §9.4) and a
semver-ish compatibility rule to define.

**C. Adapter plugins.** No protocol change. A host that breaks `todos`
also ships a plugin `inject: [TodosV2], provides: [TodosV1]` that adapts.
Old plugins keep working; the adapter is unloaded when no longer needed.
Composes with A for the keys. Cost: someone writes adapters; the
"incompatible" case is still just `absent`.

Leaning: **A + C** as the documented convention now (zero protocol cost,
solves scenarios 2 and 4, gives a migration path), with **B** deferred
until a real marketplace shows that `absent` is not a good enough answer
for scenario 1. If B is adopted later, A's keys are still valid.

## Spec impact

- A + C: none normative. A recommended convention in §2 and a guide
  section.
- B: §2 (token shape), §5.1 (activation matching), §9.4 (new status),
  §13.3 (bindings expose it), §15 (scenarios 1 and 3 as conformance).

## Alternatives and workarounds

- **Do nothing** until publishing. Correct for now; this is a
  marketplace problem, and the example's marketplace has one plugin.
- **Never break a contract** (additive-only, like a wire protocol). The
  discipline is worth recommending regardless; it doesn't remove the need
  when it's violated.

## Open questions

1. Is `incompatible` worth a fourth `state()` status, or is a reason
   string on `absent` enough?
2. Should the manifest (§14) carry required token versions, so the
   marketplace can warn *before* install? That's cheap and independent
   of A/B/C.
3. Does the Dart port need this at all, given Dart plugins compile with
   the host? Possibly only A, as documentation.

## Implementation status

| Implementation | Status | Tracking |
|---|---|---|
| yatoi-js | — | |
| yatoi-dart | — | |
