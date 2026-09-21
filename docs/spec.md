# yatoi protocol specification

**Status: v0.1 — normative for the TypeScript implementation in this repo,
and the document a port to another language is built against.**

This describes *what* a conforming kernel and binding do, in terms that do
not depend on JavaScript, React, or any runtime. It says nothing about how.
The TypeScript implementation (`packages/kernel`) is one conforming
implementation; its test suite is the executable form of this document,
and §15 maps every section here to the test that pins it. When the two
disagree, the tests are wrong until this document is changed — change
this first, then the tests, then the code.

Language: MUST / MUST NOT / SHOULD / MAY as in RFC 2119. Anything not
marked normative is explanatory.

---

## 1. Terms

| Term | Meaning |
|---|---|
| **kernel** | The container. Holds the registry of values, the set of loaded plugins, and drives activation. One per application, typically. |
| **token** | A key naming a capability. Has a `kind` (service or collection) and a string `key`. Carries a compile-time type where the language allows. |
| **service** | A single value published under a service token by exactly one active plugin at a time. |
| **collection** | An ordered multi-set of values published under a collection token by any number of plugins. |
| **contribution** | One entry in a collection: `{ value, priority, mode, owner }`. |
| **plugin** | A named unit with declared dependencies (`inject`), declared outputs (`provides`), and a `setup` procedure. Plain data until loaded. |
| **scope** | A plugin instance's handle on its own lifetime. Everything a plugin does through its scope is reversible and is reversed on dispose. |
| **disposer** | A procedure registered on a scope to undo an effect. May return an awaitable. |
| **handle** | What `load` returns: the plugin, its current state, its last error, and `dispose()`. |
| **registered** | The plugin has been passed to `load` and not yet to `unload`. |
| **active** | The plugin's `setup` has completed and its scope is live. |
| **binding** | A UI-framework layer that observes the kernel (e.g. `@yatoi/react`). §13. |
| **host** | The application that owns the kernel and declares slots. |

---

## 2. Tokens

2.1. A token is a value with `kind ∈ { service, collection }` and a
non-empty string `key`. Implementations SHOULD make tokens immutable.

2.2. **Identity is the `key`, not the token object.** Two tokens of the
same kind with equal keys name the same capability, wherever and however
they were created. All registry lookups, dependency checks, and cascade
matching MUST compare keys. *(Rationale: a plugin built and delivered
separately from the host carries its own token objects — and possibly its
own copy of the kernel library — and must still interoperate.)*

2.3. Implementations MUST provide a way to create a typed service token
and a typed collection token from a key (`defineService<T>(key)`,
`defineCollection<T>(key)`).

2.4. Implementations MAY additionally offer a *registry-interface* form,
where the mapping from key to type is declared centrally and tokens are
obtained by key alone (`service('todos')`). This is a typing convenience
with no runtime behaviour; a token so obtained is indistinguishable at
runtime from one made by 2.3. Languages without open type augmentation
need not offer it.

2.5. **Reserved key namespace.** Keys of the form `slot:<name>` denote the
collection behind a slot named `<name>` (§13.6). A slots layer MUST use
exactly this form, and nothing else MAY use the `slot:` prefix.

---

## 3. Plugins

3.1. A plugin definition has:

| Field | Required | Meaning |
|---|---|---|
| `name` | yes, non-empty | Identity for logs, errors, and contribution ownership. Not used for matching. |
| `inject` | no (default empty) | Ordered list of service tokens that MUST all be present for the plugin to activate. |
| `provides` | no (default empty) | List of service tokens the plugin is permitted to `provide`. |
| `setup(scope)` | yes | Runs on activation. MAY be asynchronous. |

3.2. A plugin is identified by **object identity**, not by `name`. Two
definitions with the same name are two plugins. *(Rationale: a binding
that loads on mount and unloads on unmount needs a stable identity that
survives re-renders; the object is that identity.)*

3.3. Defining a plugin has no effect. Nothing happens until it is loaded.

---

## 4. Kernel operations

A kernel MUST expose the following. Names are illustrative; semantics are
normative.

| Operation | Semantics |
|---|---|
| `load(plugins…) → handles` | Registers each plugin at top level (§5). Synchronous. Returns one handle per plugin. MUST error if a plugin object is already registered at top level (§5.4). |
| `unload(plugin)` | Unregisters a top-level plugin and disposes it (§8). Synchronous from the caller's view (§9). MUST be a no-op, not an error, if the plugin is not registered at top level (§5.5). |
| `get(serviceToken) → value?` | The current value, or absent. |
| `state(serviceToken) → present(value) \| absent \| loading` | §9.4. |
| `list(collectionToken) → contributions[]` | §11. |
| `pluginState(plugin) → state` | The most recent registration's state (§7), or `inactive` if never loaded. |
| `subscribe(listener) → unsubscribe` | Change notification (§9.5). |
| `version` | Monotonic counter, incremented on every observable change (§9.6). |
| `on('error', listener) → unsubscribe` | Error reporting (§10.5). |
| `settle() → awaitable` | Resolves when no setup or disposal is in flight. |
| `dispose() → awaitable` | Unloads every top-level plugin, then settles. |

A handle MUST expose `plugin`, `state`, `error`, and `dispose()`, where
`dispose()` is equivalent to `unload` for a top-level plugin and unloads
a child from its parent (§6.7) otherwise.

---

## 5. Registration and activation

5.1. `load` **registers**; it does not activate. Activation is **derived**:
a registered plugin activates when, and only when, every token in its
`inject` list is present (§9.4 `present`). A plugin with an empty
`inject` activates immediately on load.

5.2. Activation MUST be independent of load order. Loading a dependent
before its provider is permitted; the dependent activates when the
provider does.

5.3. Activation runs `setup` with a fresh scope (§6). If `setup` returns
synchronously the plugin is `active` when `load` returns; if it returns an
awaitable the plugin is `starting` until it resolves (§7).

5.4. Registering the same plugin object twice under the same parent
(top level, or the same parent scope) MUST error. *(Rationale: the object
is the identity; a second registration would either double-provide or be
silently ignored, and both hide a caller bug.)*

5.5. Unloading a plugin that is not registered MUST be a no-op.
*(Rationale: bindings call unload from cleanup paths that may run after
the plugin was already removed.)*

5.6. A registration that is unregistered while `disposing` MUST NOT be
restarted. A registration that is unregistered and has reached
`inactive` or `failed` MAY be discarded.

---

## 6. Scope

A scope is created per activation and passed to `setup`. It exposes:

6.1. **`active`** — true from creation until disposal begins; false
thereafter, permanently.

6.2. **`defer(fn)`** — registers a disposer. Disposers run in LIFO order
on dispose. If the scope is already disposed, `defer` MUST run `fn`
immediately (so a late-arriving cleanup is never lost).

6.3. **`provide(token, value)`** — publishes a service.
- MUST error if `token` is not in the plugin's `provides` (§10.3).
- MUST error if `token` is currently provided, by anyone (§10.4).
- MUST register the removal as a disposer, so the value is withdrawn on
  dispose.
- If the scope is disposed, MUST be a no-op (SHOULD warn) — never a
  late publication (§6.8).

6.4. **`get(token) → value?`** — reads a service. For a token in `inject`
the value MUST be the one that was present at activation, and MUST remain
readable for the scope's lifetime *including inside disposers* — even if
the provider has already been withdrawn by the time a disposer runs
(§8.3). For other tokens, the current registry value or absent.

6.5. **`contribute(collection, value, { priority?, mode? })`** — adds a
contribution (§11). MUST register removal as a disposer. If the scope is
disposed, MUST be a no-op (SHOULD warn).

6.6. **`load(plugin) → handle`** — registers a *child* plugin whose
lifetime is bound to this scope (§6.7). MUST error if the scope is
disposed.

6.7. **Scope tree.** A child registered via `scope.load` belongs to the
parent scope, not to the kernel's top level: `kernel.unload(child)` MUST
NOT affect it (§5.5 applies — no-op), and disposing the parent MUST
unregister and dispose the child *before* the parent's own disposers run.
Children may `get` services the parent provided. A child's handle may
dispose just the child.

6.8. **Late effects are inert.** Once a scope is disposed, nothing done
through it reaches the registry. A `setup` that resolves after disposal
MUST leave no trace: no value provided, no contribution added, no state
transition to `active`. *(This is the sync-facade guarantee applied to
the plugin author's own code; §15 T1 is its test.)*

---

## 7. Plugin state machine

```
             ┌──────────── inject all present ─────────────┐
             ▼                                              │
inactive ─▶ starting ── setup returns / resolves ──▶ active
   ▲            │                                           │
   │            └── setup throws / rejects ──▶ failed       │
   │                                             │          │
   └────── disposal promises settle ◀── disposing ◀── any inject absent, or unload
```

| State | Meaning |
|---|---|
| `inactive` | Registered, waiting on dependencies (or never loaded). |
| `starting` | `setup` is running or its awaitable is pending. Values it has already provided are present. |
| `active` | `setup` completed. |
| `disposing` | Disposers have been invoked; at least one returned an awaitable that has not settled. |
| `failed` | `setup` threw or rejected. Sticky (§10.2). |

7.1. Transitions out of `disposing` happen only when every disposer
awaitable has settled. A registered plugin whose dependencies are present
MUST NOT restart while its previous scope is `disposing`; it restarts when
disposal settles (§8.5).

7.2. `failed` MUST NOT retry on its own. It clears to `inactive` when the
plugin is unloaded, or when any of its `inject` tokens becomes absent — so
a fixed dependency gets a fresh attempt when it returns.

---

## 8. Disposal

8.1. **Triggers.** A scope disposes when its plugin is unloaded, when any
token in its `inject` becomes absent, or when its parent scope disposes.

8.2. **Order within a scope.** Children first (§6.7), then the scope's
own disposers in LIFO order. The removal of each provided service and
each contribution is itself a disposer registered at the time of the
`provide` / `contribute`, so it participates in LIFO ordering.

8.3. **Cascade order across plugins.** When a plugin that provides tokens
disposes, every registered plugin that injects any of those tokens and is
`starting` or `active` MUST be disposed **before** the provider's own
disposers run, recursively. *(Rationale: a dependent's cleanup may still
need the service; combined with §6.4 this makes cleanup order
deterministic and testable.)*

8.4. **Synchronous invocation.** All disposers of all affected scopes MUST
be *invoked* before `unload` returns. Awaitables they return are
collected, not awaited. Consequence: by the time `unload` returns, every
provided value and contribution is gone from the registry (§9.1).

8.5. **Reload gating.** A registered plugin whose scope is `disposing`
does not restart until every collected awaitable settles. Two
registrations of the same plugin object (load → unload → load) are
independent: the second MAY start while the first is still `disposing`,
because the first's registry effects are already undone (§8.4) — the
tokens are free.

8.6. **Stale disposers.** A disposer that withdraws a service MUST only
withdraw it if the withdrawing scope is still the provider. A newer
provider of the same key MUST NOT be evicted by an older instance's
disposer settling late.

---

## 9. The synchronous facade

The kernel owns asynchrony. Observers — bindings above all — see only
synchronous snapshots, and never a pending operation.

9.1. After `unload(p)` returns, `get(t)` MUST be absent for every `t` that
`p` provided, and `list(c)` MUST exclude every contribution `p` made —
regardless of whether `p`'s disposers returned awaitables.

9.2. After `load(p)` returns, if `p`'s `setup` is synchronous and its
dependencies were present, `get(t)` MUST be present for every `t` it
provided.

9.3. A value provided during a still-pending asynchronous `setup` is
present from the moment `provide` is called. Presence is not gated on
`setup` completing.

9.4. **`state(token)`** MUST return:
- `present(value)` if a value is registered under the key;
- otherwise `loading` if some **registered** plugin lists the token in
  `provides` and is `starting`, or is `disposing` while still registered
  (i.e. will restart);
- otherwise `absent`.

A provider that is itself `inactive` because *its* dependencies are
absent reads `absent`, not `loading`. *(Rationale: `loading` means
progress is being made; a UI may show a spinner for it and must not for a
plugin that will not activate.)*

9.5. **Notification.** `subscribe` listeners MUST be invoked synchronously,
**once**, after each externally initiated mutation completes — including
all the activations and cascades it caused — not once per internal step.
Asynchronous completions (a `setup` resolving, a disposal settling) count
as mutations and notify likewise.

9.6. **`version`** MUST increase on every change that any of `get`,
`state`, `list`, or `pluginState` could observe, and MUST NOT change
otherwise. Reads never change it.

9.7. **Referential stability.** `get(t)` MUST return the very object that
was provided, unchanged in identity, for as long as it is present.
`list(c)` MUST return the same array/list object across calls until the
collection changes, and a single shared empty list when empty.
*(Rationale: bindings compare snapshots by identity to skip re-rendering.)*

---

## 10. Errors

10.1. **Containment.** A `setup` that throws (or an awaitable that
rejects) MUST fail only that plugin: its scope is disposed (so partial
effects unwind), its state becomes `failed`, its handle's `error` is set,
and no other plugin is affected. `load` MUST NOT throw because a plugin's
`setup` failed.

10.2. **Stickiness.** `failed` persists per §7.2. A failed plugin's
registration remains; it is not silently dropped.

10.3. **Provide guard.** `provide(t)` with `t ∉ provides` MUST throw
inside `setup`, causing 10.1. *(Rationale: `inject` + `provides` is the
whole dependency graph; it must be legible from declarations alone.)*

10.4. **Single provider.** If a token is already provided when a second
plugin calls `provide` for it, the second call MUST throw (→ 10.1). The
first provider is unaffected. There is no override or priority for
services; that is what collections are for.

10.5. **Disposer errors.** An error thrown by a disposer, or a rejection
of a disposer's awaitable, MUST be reported (10.6) and MUST NOT prevent
the remaining disposers from running, nor propagate to the caller of
`unload`.

10.6. **Reporting.** Errors from 10.1 and 10.5 go to `on('error')`
listeners with the error and the plugin. If no listener is registered,
implementations SHOULD write to the platform's error log. Errors MUST
NOT be swallowed silently.

---

## 11. Collections

11.1. A contribution is `{ value, priority, mode, owner }`: the opaque
value, a numeric priority (default `0`), a mode string (default
`"append"`), and the contributing plugin's `name`.

11.2. The kernel stores `mode` and never interprets it. Well-known modes
are `append`, `replace`, `wrap` (§13.6); layers MAY define others.

11.3. `list(c)` MUST be ordered by priority **descending**, with insertion
order preserved among equal priorities (a stable sort).

11.4. Contributions are scope effects: removed when the contributing
scope disposes (§8.2), never by explicit call.

11.5. Adding or removing a contribution is an observable change (§9.5,
§9.6).

---

## 12. Convergence

12.1. After any mutation, the kernel MUST reach a fixed point in which
every registered plugin's state agrees with §5.1 and §7, before
notifying (§9.5). Activations may cause further activations (a newly
provided token satisfies another plugin); disposals may cascade (§8.3).
The kernel iterates until nothing changes.

12.2. Implementations MUST guard against non-convergence (a `setup` that
mutates the kernel in a way that never settles) and surface it as an
error rather than hang.

12.3. Mutations that occur while a mutation is in progress — a `provide`
inside a `setup`, a `load` inside a `setup` — MUST be folded into the
same convergence pass and the same notification.

---

## 13. Bindings

A binding projects the kernel into a UI framework. The requirements
below hold for any framework; React is the reference.

13.1. **Observation only during render.** A binding MUST read the kernel
through synchronous snapshots (§9) during the framework's render/build
phase and MUST NOT mutate it there. Mutations (`load`, `unload`,
`provide`, `contribute`) belong in event handlers, lifecycle effects, or
outside the framework. *(Rationale: frameworks may discard a render
mid-flight; plugin loading is not rollback-able.)* A binding MAY offer a
development-mode guard; it MUST NOT offer one that gives false negatives.

13.2. **Subscription.** Reads MUST be tied to `subscribe` so that a
change is reflected in the next render, and MUST use the framework's
tearing-safe primitive where one exists (React: `useSyncExternalStore`).
Where the framework cannot tear (Vue's refs), the binding MUST still
write its snapshot only when the underlying value's identity changed —
that identity check, not the primitive, is what keeps unrelated kernel
changes from re-running readers. A component reading one token MUST NOT
re-render for changes that leave that token's snapshot identical (§9.7
makes this cheap).

13.3. **Optional read.** A binding MUST offer a read that yields the value
or absent (`useService(token) → T?`), and SHOULD offer the three-state
read (`useServiceState → present | absent | loading`).

13.4. **Requirement boundary.** A binding MUST offer a construct that
takes one or more service tokens and renders its children only while all
are present, otherwise a fallback — and whose children are **unmounted**
(their own cleanups run) when any becomes absent, and mounted fresh when
all return. Inside, the values are typed as present. *(This is the
binding-level form of cascade unload, and the recommended default over
13.3.)*

13.5. **Component-scoped loading.** A binding MUST offer a way to load a
plugin for the lifetime of a component: load on mount, unload on unmount.
It MUST survive the framework's double-invocation of lifecycle (React
StrictMode; Flutter hot reload): mount → unmount → mount MUST end with
exactly one active instance and the first instance's disposers run once.
A framework with no such mechanism (Vue) gets no free exercise of this
path, so its binding's tests MUST perform the remount explicitly.

13.6. **Slots.** A slots layer declares named contribution points with a
props type, and maps slot `<name>` to the collection with key
`slot:<name>` (§2.5). This clause has a **neutral part** — the name/props
declaration itself (the `Slots` registry interface or equivalent, plus the
key-mapping function) — and a **binding part**, layered on top per
framework. A TypeScript implementation MAY split these into separate
packages, as the reference implementation does (`@yatoi/slots` for the
neutral part; `@yatoi/react-slots`/`@yatoi/vue-slots` for the binding
part) so that a host using more than one framework binding declares its
`Slots` once. Either way, it MUST offer:
- **contribute(scope, name, renderer, { priority, mode })** — a typed
  wrapper over `scope.contribute` on that collection. The renderer
  receives the slot's props plus `Default` (the renderer beneath it).
  Props MUST be type-checked against the slot's declaration where the
  language allows.
- **list rendering** — all contributions with mode `append`, in
  collection order (§11.3), each receiving the props; a host-supplied
  fallback when there are none.
- **single rendering** — one renderer: the host default with `replace`
  and `wrap` contributions folded over it from **lowest to highest**
  priority, so the highest is outermost. `replace` becomes the current
  renderer; `wrap` becomes the current renderer and receives the previous
  one as `Default`. `append` contributions are ignored in single mode.
- **identity stability** — contributed renderers MUST keep identity
  across host re-renders while the collection and default are unchanged,
  so contributed components are not remounted spuriously.

13.7. The kernel MUST NOT know that a contributed value is a renderer.
Slots are entirely a layer above §11.

---

## 14. Manifests

14.1. A host that lets users install plugins SHOULD describe them with
data separate from code: a **manifest** — a list of entries with at least
`id`, `name`, `version`, `description` — that can be rendered without
any plugin code loaded.

14.2. Activation is a separate mapping from `id` to code, whose form is
platform-specific: an in-bundle registry, a URL to a separately built
module, a compiled-in factory. A manifest entry with no activation is
*unavailable*: describable, not runnable.

14.3. Activation MUST validate what it obtains before handing it to
`load` (at minimum: a non-empty `name` and a callable `setup`), and an
activation failure MUST be surfaced to the user and MUST NOT crash the
host or be persisted as an installed plugin.

14.4. Hosts SHOULD persist installed ids and re-activate them at startup,
outside the render phase.

*Non-normative — delivery on mobile.* Loading plugin code at runtime is
a platform and policy question, not a protocol one. On the web it is
`import(url)`. In React Native the default bundler cannot fetch code, but
runtime loaders exist (Re.Pack's `ScriptManager`), and store policy
permits downloaded interpreted code that extends the app itself rather
than acting as a store for other apps (Apple 2.5.2; Google Play allows
interpreted code in a VM or WebView); a WebView shell running the web
build is the simplest fully-permitted route, and is how Obsidian ships
community plugins on iOS. Ahead-of-time compiled platforms (Flutter) have
no interpreter: plugins compile in, and post-install dynamism is data —
see proposal 0003. The protocol is the same in every case; only §14.2's
activation mapping differs.

---

## 15. Conformance scenarios

Every clause above is pinned by at least one test in the TypeScript
implementation. The scenarios below are the ones a port MUST reproduce
exactly; the table after them maps sections to tests.

**T1 — provider unloads while dependents are mid-async setup.**
Given a provider `P` of token `C` and three dependents `D1..D3` with
`inject: [C]`, each with an asynchronous `setup` that registers a
disposer, then awaits, then provides its own token `Oi`:
1. Load `P, D1, D2, D3`. All `Di` are `starting`; each `Oi` reads `loading`.
2. Unload `P`. Synchronously: every `Di` is `inactive`; each pre-await
   disposer ran exactly once; each `Oi` reads `absent`.
3. Let the three awaits resume. Each `Di`'s post-await code runs but
   MUST land nothing: `get(Oi)` absent, `Di` still `inactive`, no error
   reported (warnings permitted).
4. Load `P` again and settle. Each `Di` ran `setup` exactly twice in
   total, is `active`, and provides its second-run value.
5. Across the whole sequence, no observer notification MAY show any `Oi`
   as `present` between step 2 and step 4's completion.

**T2 — a stale setup provides, then is disposed, then provides again.**
A dependent provides `X` after its first await, then awaits again, during
which its provider is unloaded. `get(X)` MUST be absent immediately after
the unload, and MUST remain absent after the second await resumes and
calls `provide(X)` again.

**T3 — synchronous load → unload → load.**
Same plugin object, providing a token, with a synchronous `setup`.
Afterwards: `setup` ran twice, the first instance's disposer ran once, the
plugin is `active`, and the provided value is the second instance's.

**T4 — the same, with an asynchronous disposer.**
The first instance's disposer returns an awaitable. The second load MUST
still activate immediately (the token was released synchronously, §8.4);
when the awaitable settles nothing further changes.

**T5 — cascade order.** `clock` provides `Clock`; `mid` injects `Clock`,
provides `Derived`, registers disposers `a` then `b`; `leaf` injects
`Derived`, registers disposer `c`. Unload `clock`. Observed order MUST be
`c, b, a, clock's own`. Inside `c` (and `b`, `a`), `scope.get` of the
injected token MUST still return the value.

### Section → test map (TypeScript implementation)

| Spec | Test |
|---|---|
| §2.2, §2.5 | `kernel.test.ts` 11; `slots.test.ts` "is the same collection a hand-built key would reach"; `react-slots.test.tsx` "cross-bundle interop"; `react.test.tsx` `<Requires>` "resolves a token created separately"; `vue-slots.test.ts` "cross-bundle interop"; `vue.test.ts` `Requires` "resolves a token created separately" |
| §2.4 | `tokens.test.ts` "service() / collection()" |
| §3.1 `name` | `tokens.test.ts` "requires a name" |
| §5.1–5.3 | `kernel.test.ts` 1 |
| §5.4, §5.5 | `kernel.test.ts` 1 "loading the same plugin twice…" |
| §6.2, §6.3, §6.5, §6.8 | `kernel.test.ts` 5 |
| §6.4 | `kernel.test.ts` 2 "dependent cleanup can still read…" |
| §6.6, §6.7 | `kernel.test.ts` 9 |
| §7, §7.1 | `kernel.test.ts` 3 "waits for async disposal…" |
| §7.2 | `kernel.test.ts` 6 "failure does not retry…" |
| §8.2, §8.3 (T5) | `kernel.test.ts` 2 |
| §8.4, §9.1 | `kernel.test.ts` 4 "state() flips synchronously…"; `torture.test.ts` T4 |
| §8.5 (T3, T4) | `torture.test.ts` "StrictMode-shaped double invoke" |
| §8.6 | `kernel.test.ts` 8 "a stale disposer never evicts…" |
| §9.4 | `kernel.test.ts` 4 "reports loading…", "…reads absent, not loading" |
| §9.5, §9.6 | `kernel.test.ts` 4 "subscribe fires once…", "version bumps…" |
| §9.7 | `kernel.test.ts` 10; `react.test.tsx` "does not re-render for unrelated…"; `vue.test.ts` `useService` "does not trigger for unrelated…" |
| §10.1, §10.5, §10.6 | `kernel.test.ts` 6 |
| §10.3 | `kernel.test.ts` 7 |
| §10.4 | `kernel.test.ts` 8 |
| §11 | `kernel.test.ts` 10 |
| §13.2 | `react.test.tsx` "concurrent rendering"; `vue.test.ts` "reactivity sanity" (Vue's reactivity can't tear; the test asserts the guarantee anyway) |
| §13.3 | `react.test.tsx` `useService`, `useServiceState`; `vue.test.ts` `useService`, `useServiceState` |
| §13.4 | `react.test.tsx` `<Requires>`; `vue.test.ts` `Requires` |
| §13.5 | `react.test.tsx` `usePlugin`; `torture.test.ts` T3; `vue.test.ts` `usePlugin` (including the explicit mount → unmount → mount remount case, Vue's stand-in for StrictMode double-invoke) |
| §13.6 | `slots.test.ts` (neutral contract); `react-slots.test.tsx` (all); `vue-slots.test.ts` (all) |
| §14 | `examples/todo` (not a test; the reference host) |
| T1, T2 | `torture.test.ts` "provider unloads while dependents are mid-async setup" |
| `dispose()` / `settle()` | `kernel.test.ts` "kernel.dispose" |

---

## 16. Porting notes (non-normative)

What is protocol and what is TypeScript, for anyone implementing this in
another language.

| Concept | TypeScript | Dart (sketch) |
|---|---|---|
| awaitable | `Promise` / thenable | `Future` |
| disposer return | `unknown`; a thenable is awaited | `FutureOr<void>` |
| token type carrier | phantom generic on an interface | `class ServiceToken<T> { final String key; }` |
| registry-interface form (§2.4) | declaration merging | not available; skip |
| slot declaration | augmentable `Slots` interface | exported `SlotDef<Props>` constants |
| identity of a plugin | object reference | object reference (`identical`) |
| no-platform-types constraint on the kernel | `lib: ["ES2022"], types: []` | pure Dart package; `flutter` import is a lint error |
| tearing-safe read | `useSyncExternalStore` | `ListenableBuilder` / `ValueListenableBuilder` over a `ChangeNotifier` wrapping `subscribe` |
| requirement boundary (§13.4) | `<Requires>` render prop | a widget that rebuilds its child subtree only while present |
| component-scoped load (§13.5) | `useEffect` load/unload | `StatefulWidget`: `initState` load, `dispose` unload |
| render-phase mutation (§13.1) | no runtime guard | Flutter throws on `setState` during `build`; the rule is the same |
| manifest activation (§14.2) | registry map or `import(url)` | compiled-in `Map<String, Plugin Function()>`; Dart AOT has no interpreter, so post-install dynamism is declarative (proposal 0003) |

Things ports commonly get wrong, in order of how much they matter:

1. Awaiting disposers before returning from `unload` (violates §8.4).
   All disposers are *invoked* synchronously; only their results are
   awaited, and only to gate restart.
2. Notifying once per internal step instead of once per external
   mutation (§9.5). Batch, converge, notify.
3. Letting a late `setup` land after disposal (§6.8). Check the scope is
   still the live one before every state transition.
4. Comparing tokens by object (§2.2). Compare keys.
5. Reporting `loading` for a provider that is blocked on its own
   dependencies (§9.4).
