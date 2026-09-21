# yatoi todo-vue example

The same app, the same kernel, a different framework. A Vue 3 port of
[`examples/todo`](../todo/README.md)'s **chapter 1 only** — todos, a
kernel-scoped store, an installable calendar plugin that adds a due-date
field and a month view — on `@yatoi/kernel`, `@yatoi/vue`, and
`@yatoi/vue-slots` instead of `@yatoi/react`/`@yatoi/slots`. No chapter 2:
no remote loading, no import map, no `VITE_PLUGIN_BASE` seam. That story
is about bundlers, not frameworks, and the React example already tells it.

## Run it

```bash
pnpm --filter yatoi-example-todo-vue dev
```

`:5175` (also `.claude/launch.json` → `todo-vue-example`), so it can run
beside the React example's `:5173` without colliding — including in
`localStorage`: this app uses the `yatoi-todo-vue:*` key prefix, the React
example uses `yatoi-todo:*`.

## Layout

```
src/
  main.ts, App.vue, TodoList.vue, Marketplace.vue, styles.css
  kernel.ts                  createKernel() at module scope
  bootstrap.ts                loads todosPlugin + previously-installed plugins, once, pre-mount
  core/todos.ts                todosPlugin (kernel-scoped store); imports the Todos token + types
                                from ../contract
  contract/                    tokens + types the host and its plugins agree on, no behaviour —
                                index.ts, todos.ts, views.ts, useTodos.ts, slots.ts
  plugins/
    registry.ts                 id → () => import('./calendar/index.js')
    calendar/index.ts            the plugin: due-date field + month view + style injection,
                                  kernel-scoped; imports the contract from ../../contract
    calendar/DueDateField.vue, CalendarView.vue   real SFCs — see below
    calendar/calendar.css        ships with the plugin, injected as a <style> in setup(),
                                  removed on dispose
  marketplace/
    installed.ts                 installed-plugin ids, persisted to localStorage
    useMarketplace.ts            manifest fetch, install/uninstall, installed-id persistence
public/plugins.json           manifest: id, name, version, description — data only
vite.config.ts, index.html, package.json, tsconfig.json
```

Everything not listed above (chapter 2's `dist-plugin`, remote loading,
`vite.plugin.config.ts`, an import map) doesn't exist here — see
`examples/todo/README.md` for that story.

Structurally this mirrors the React example row for row — same
`contract`/`core`/`plugins`/`marketplace` split, same kernel-scoped
`todosPlugin`, same manifest/activation split, same slot + `Views`
collection. Read `examples/todo/README.md`'s "what demonstrates what"
table for what those rows mean; it isn't repeated here. This README only
covers what's *different* because the framework is Vue.

## What's different here

### Where the kernel is provided — and a self-provide trap

`main.ts` wraps `App` in `<KernelProvider :kernel="kernel">` (via `h()`,
since `main.ts` is plain TypeScript, not an SFC) rather than having
`App.vue` call `provideKernel(kernel)` on itself. That wasn't the
original design here — it's a fix. The first version had `App.vue` call
`provideKernel(kernel)` at the top of its own `<script setup>`, reasoning
that the root SFC calling it directly is one file fewer than wrapping.
That crashed at runtime: `useKernel: no provideKernel()/<KernelProvider>
above this component`, thrown from `App`'s own `useContributions(Views)`
call a few lines later in the same file. **Vue's `provide()`/`inject()`
only reaches descendant component instances — never the instance that
called `provide()` itself.** `App.vue` needs the kernel for its own
`useContributions`/`<Requires>` calls, so it cannot also be the component
that provides it; something has to sit above it. `<KernelProvider>` in
`main.ts` is that something. This is a real trap for anyone porting a
React app where `<KernelProvider>` and the root consuming component are
conventionally the same JSX element's children — in Vue, "provide it
here, consume it here" silently fails instead of erroring at the call
site of `provide()`, because `provide()` itself never throws; only the
later `inject()` does, on a component that looks, at a glance, like it
should already have it.

### SFCs are allowed here, but not in the library

`@yatoi/vue`/`@yatoi/vue-slots` themselves ship no `.vue` files —
`Slot.ts`, `Requires.ts` are `defineComponent`/functional-component
TypeScript, because a library can't assume its consumer's build pipeline
compiles SFCs. An *app* can assume that about itself, so `App.vue`,
`TodoList.vue`, `Marketplace.vue`, and the calendar plugin's
`DueDateField.vue`/`CalendarView.vue` are real `<script setup lang="ts">`
SFCs — the surface a Vue developer would actually write, and what this
example exists to get feedback on. The `contract`, `core`, `plugins/
registry.ts`, and `marketplace` logic stay `.ts`, same as the React
example's non-component files.

### Passing `todos` into contributed components — the factory, not a composable

The plugin is kernel-scoped: it has `scope.get(Todos)` at `setup()` time,
but the components it contributes (`DueDateField.vue`, `CalendarView.vue`)
render later, inside the host's tree. Two ways to bridge that:

1. **Factory** (what this example does) — `setup()` closes over `todos`
   and returns a small *functional* component that supplies it as a prop:
   ```ts
   function makeDueDateField(todos: TodoStore): SlotRenderer<'todo.item.extra'> {
     return (props) => h(DueDateField, { todo: props.todo, todos })
   }
   ```
   `DueDateField.vue` itself just declares `todos: TodoStore` as an
   ordinary typed prop via `defineProps`. This is `examples/todo`'s
   `makeDueDateField`/`makeCalendarView` pattern, unchanged in shape.
2. **Composable** — `DueDateField.vue` could instead call
   `useService(Todos)` itself, inside its own `<script setup>`, and take no
   `todos` prop at all.

We picked the factory. **Trade-off:** the factory keeps the plugin
self-contained — `setup()` is the single place that resolves `Todos`, and
the SFC stays a plain, testable component that takes its dependency as a
prop, provable without mounting it under a kernel at all. It also mirrors
the React example exactly, which was the point of this port: it tells you
whether the *pattern*, not just the API, survives the framework switch.
The composable is more idiomatic Vue — `useService` inside `<script
setup>` is how most Vue + Pinia/VueUse code already looks — but it
couples the SFC to always being rendered under a `provideKernel()`
ancestor, which a plain prop doesn't. If `DueDateField.vue` is ever reused
somewhere the kernel isn't available (a Storybook story, a different
host), the factory version still renders with a stub `todos`; the
composable version throws.

`Views`' `View` field is a plain `Component` with no props at all (same
constraint as the React example's `ComponentType`), so `CalendarView.vue`
goes through the identical wrapping — `makeCalendarView(todos)` returns a
zero-prop functional component that supplies `todos` via `h()`.

### `<Slot>` props as attrs

```html
<Slot name="todo.item.extra" :todo="todo" />
```

Confirmed: the contributed component receives `todo` correctly at
runtime. But `:todo="todo"` is a plain Vue attr binding, not a typed
component prop — `<Slot>` declares `inheritAttrs: false` and reads
`attrs` internally (see `packages/vue-slots/src/Slot.ts`), because Vue has
no way to spread an arbitrary typed prop bag onto a component's declared
prop set the way JSX does. **This is the real Vue cost of the slot
contract**: `vue-tsc` cannot check that a `<Slot name="todo.item.extra">`
call site passes a `todo` of the right shape, or that it's passed at all.
Get the slot name right and the prop wrong (or missing), and nothing red-
squiggles; you find out at runtime, or not at all if the contributed
renderer silently accepts `undefined`. `@yatoi/slots`' React `<Slot>` has
the same gap in principle (extra JSX props aren't checked against
`Slots[N]` by the compiler either in every case), but attrs make Vue's
version more visible — attrs are *designed* to be an escape hatch from
typed props, so there's no natural place to add the check later without
changing `<Slot>`'s calling convention.

### `<Requires>` and `v-slot` array destructuring

The array-destructuring form itself compiles and works in a real SFC —
`v-slot="pattern"` accepts any binding pattern a function parameter would,
array destructuring included, confirmed under real SFC compilation, not
just the `@vue/test-utils` `h()`-based tests in
`packages/vue/test/vue.test.ts`. **But the obvious way to write it, as
shorthand on `<Requires>` itself, crashes the production build** the
moment a `<template #fallback>` sibling is present:

```html
<!-- crashes `vite build` (works fine in dev) once #fallback is added: -->
<Requires :of="[Todos]" v-slot="[todos]">
  <Dashboard :todos="todos" />
  <template #fallback><Spinner /></template>
</Requires>
```

```
error during build:
[vite:vue] Cannot read properties of undefined (reading 'type')
    at genNode (@vue/compiler-core/dist/compiler-core.cjs.prod.js:4026:16)
    ...
```

I isolated this to a two-line repro outside this app (a throwaway
`Requires`-only component) before touching `App.vue`: any `v-slot="..."`
on `<Requires>`'s default content — scoped, unscoped, destructured or
not — combined with a sibling `<template #fallback>` reproduces the crash
in `@vue/compiler-core@3.5.43`'s production codegen. Drop the fallback
template and it builds; drop `v-slot` and keep the fallback and it builds;
only the combination fails. This reads as a genuine Vue compiler bug
(scoped default slot + a second named `<template>` slot on the same
component), not something `@yatoi/vue` did wrong — but `<Requires>` is
*exactly* the shape that invites hitting it, since a fallback is its
flagship use case. **The workaround**, used in this app's `App.vue`, is to
spell the default slot as its own explicit `<template>` instead of the
shorthand:

```html
<Requires :of="[Todos]">
  <template #default="[todos]">
    <Dashboard :todos="todos" />
  </template>
  <template #fallback><Spinner /></template>
</Requires>
```

This builds cleanly. Nothing in `@yatoi/vue` needs to change for this —
it's a template-authoring gotcha, not an API gap — but it belongs in
`docs/guide.md`'s Vue section (currently shows the shorthand form) and in
`<Requires>`'s own doc comment, since `dev` mode gives no warning at all;
only `vite build`'s production codegen path hits it.

**Typing, separately, is the second finding.** `Requires`'s exported signature is
```ts
export const Requires: <Tokens extends readonly AnyServiceToken[]>(props: RequiresProps<Tokens>) => VNode
```
a typed signature layered over an untyped `defineComponent` (`RequiresImpl`,
cast with `as never`) — the same trick `<Slot>` uses. That typed signature
is a **function-call shape**: it types `h(Requires, { of: [Todos] }, {
default: (v) => ... })`, where `v`'s type flows from `Tokens`. A
`<template>` usage doesn't go through that call signature at all — Vue's
SFC compiler lowers `<Requires :of="[Todos]" v-slot="[todos]">` to
`h()`-shaped render code, but the *default-slot callback's parameter type*
is whatever `vue-tsc` can infer for a scoped-slot binding on a
`defineComponent`-typed component, and `RequiresImpl`'s own
`setup()`/`render` never declares typed slots (no `slots:` generic, no
`defineSlots`), so the exported generic signature that makes
`useService`/`h(Requires, ...)` call sites well-typed doesn't reach
template `v-slot` destructuring at all — templates don't go through that
exported function type.

**Confirmed, not just suspected.** I temporarily edited `App.vue`'s
template to call `todos.add(123)` (wrong argument type — `add` wants a
`string`) and, separately, `todos.thisMethodDoesNotExist()`, both inside
the `<Requires>` default slot. `vue-tsc --noEmit` reported **zero errors**
for either. As a control, the identical experiment against `items` in
`TodoList.vue` (typed via the `useTodos` composable's return value, an
ordinary ref, not a scoped-slot destructure) does catch a bogus method
call — `TS18046: 'todo.nonExistentXYZ123' is of type 'unknown'` — so
template type-checking is genuinely active in this project; it's
specifically the `v-slot="[todos]"` binding that resolves to `any`. This
means `App.vue` has zero compile-time protection on `todos` inside that
block — a wrong-shaped call only shows up at runtime. **Worth fixing at
the library level** — likely by giving `RequiresImpl` an explicit
`defineSlots<{ default(props: Values<Tokens>): any }>()`-shaped
declaration so `vue-tsc` can thread the type through template usage, not
just `h()`/`.tsx` usage. Filed as a candidate follow-up rather than fixed
here, since it's a `@yatoi/vue` change and this task's scope is the
example.

## Verification

```bash
npm_config_registry=https://registry.npmjs.org/ pnpm install
pnpm typecheck
pnpm --filter yatoi-example-todo-vue build
pnpm test
```

## Friction

See "What's different here" above for the two substantive findings (attrs
bypass `vue-tsc` entirely for slot props; `<Requires>`'s typed signature
doesn't reach `v-slot` template destructuring). Smaller notes:

- `contribute()`'s `Scope<any>` parameter type (in
  `packages/vue-slots/src/contribute.ts`, matching `@yatoi/slots`) means a
  plugin's `setup(scope)` parameter isn't narrowed by `contribute` calls
  either way — not new to this port, just newly visible writing a second
  plugin against it.
- Wrapping every contributed SFC in a functional-component factory (the
  chosen approach above) is boilerplate that scales linearly with the
  number of contributed components; a host with many small contributed
  widgets would likely want a shared `withService(Token, Component)`
  helper rather than hand-writing `(props) => h(X, { ...props, service })`
  each time. Not needed for two components; worth a note if a third
  example plugin is ever added.
