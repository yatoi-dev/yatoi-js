# 0004 — Contribution identity and render-time isolation

**Status:** draft · **Opened:** 2026-09-21 · **Issue:** —

## Problem

Two gaps that every binding hits the same way, so they belong to the
protocol rather than to `@yatoi/react/slots` or `@yatoi/vue/slots`:

1. **Contributions have no identity.** A `Contribution` is
   `{ value, priority, mode, owner }` ([spec §11.1](../spec.md)). A
   binding rendering a list has nothing stable to key on, so both `<Slot>`s
   key by `${owner}:${index}`. A priority change, or a sibling contribution
   unloading, shifts indices → unrelated contributed components remount
   and lose state. The kernel knows exactly when each contribution was
   made; it just doesn't say.
2. **Render errors escape the plugin.** A plugin's `setup` throwing is
   contained (§10.1): that plugin fails, nothing else notices. A plugin's
   *renderer* throwing is not: it propagates to the host's nearest error
   boundary and blanks whatever host surface the slot sits in. One bad
   contribution takes down a sidebar. The isolation the kernel gives at
   activation time stops at the render boundary.

## Motivating scenarios

1. Three sidebar items from three plugins; the middle plugin unloads. The
   third item's component MUST keep its local state (an open disclosure,
   a scroll position) — today it remounts because its index changed.
2. A plugin raises the priority of its contribution at runtime (reloads
   with a new `priority`). Nothing else in the list should remount.
3. A marketplace plugin's widget throws on a null field. The host's
   sidebar keeps rendering the other items; the broken one renders
   nothing; `kernel.on('error')` reports the error with the owning
   plugin's name, exactly as a `setup` error would.
4. DevTools: a contributed component made by a factory shows as
   `Anonymous`. It should show its owner.

## Design sketch

**Identity.** The kernel assigns each contribution a monotonically
increasing `id: number` at `contribute()` time. It is unique within a
kernel, stable for the contribution's lifetime, and gone when the
contribution is removed. Bindings key list items on it. No API is added
for looking a contribution up by id; it is an identity, not a handle.

**Render isolation (binding requirement).** A slots binding MUST render
each contribution inside a boundary that (a) catches errors thrown while
rendering that contribution, (b) renders nothing (or a host-supplied
per-item fallback) in its place, (c) reports the error through the
kernel's error channel with the contribution's `owner`, and (d) leaves
sibling contributions and the host untouched. In React that is a class
error boundary per item; in Vue, `onErrorCaptured` in a per-item wrapper.
`single` mode: the same boundary around the composed renderer; a failing
`wrap` layer fails the whole composition (it *is* the composition) and
reports the outermost failing owner.

**Naming (binding SHOULD).** When a contributed renderer has no
`displayName`/`name`, the binding presents it under `owner` in devtools.

What stays unchanged: contributions remain scope effects, ordering rules,
modes, the opaque-value rule.

## Spec impact

- §11.1 — `Contribution` gains `id`. §11 gains: ids are unique per
  kernel and stable per contribution.
- §13.6 — new MUST: per-contribution error containment as above; new
  SHOULD: devtools naming.
- §15 — new conformance rows: reorder-without-remount; a throwing
  contribution isolates and reports.

## Alternatives and workarounds

- **Bindings mint their own ids** (a `WeakMap<value, id>` keyed on the
  contributed value). Works when values are distinct objects; breaks when
  a plugin contributes the same component twice. And every binding does
  it separately. The kernel knows; it should say.
- **Hosts wrap `<Slot>` in their own boundary.** Contains the blast
  radius to the slot, not to the contribution — the whole sidebar still
  goes. And it's the host paying for the plugin's bug.
- **Do nothing.** Acceptable for one-plugin demos; not for a marketplace.

## Open questions

1. Should the per-item fallback be host-configurable on `<Slot>`
   (`itemFallback`), plugin-configurable, or always nothing? Leaning:
   host-configurable, default nothing — the host owns the surface.
2. Should a render failure affect the plugin's *kernel* state (e.g. mark
   it `failed`)? Leaning no: a render error is per-contribution and often
   transient (bad props); the plugin's services may be fine.
3. Vue's `onErrorCaptured` returning `false` stops propagation; does it
   also stop Vue's global `errorHandler`? Verify, so reporting isn't
   doubled.

## Implementation status

| Implementation | Status | Tracking |
|---|---|---|
| yatoi-js (kernel `id`) | — | |
| yatoi-js (`@yatoi/react/slots`) | — | |
| yatoi-js (`@yatoi/vue/slots`) | — | |
| yatoi-dart | — | |
