# weft todo example

A small todo app with an installable calendar plugin, built to exercise
`@weft/kernel`, `@weft/react`, and `@weft/slots` end to end.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter weft-example-todo dev
```

Or from this directory: `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm preview`.

In dev, `vite.config.ts` aliases the three `@weft/*` packages straight to
`packages/*/src/index.ts`, so there's no build-the-library step in the loop.
`pnpm build` (root) builds the real `dist/` output the `exports` fields
point at, for anyone consuming this repo as installed packages.

## What demonstrates what

| In the app | Demonstrates |
|---|---|
| `src/core/todos.ts` — `todosPlugin`, kernel-scoped, loaded once in `src/bootstrap.ts` before React renders | A composition unit that isn't a render-tree node — the store outlives every render, React only observes it. |
| `src/App.tsx` — `<Requires of={[Todos]} fallback={...}>` | Capability-level lifecycle: the shell doesn't handle "todos is undefined" as a render case, it never renders that subtree without it. |
| `src/slots.ts` (the `Slots` augmentation) + `<Slot name="todo.item.extra">` in `TodoList.tsx` + `contribute()` in `src/plugins/calendar/index.tsx` | Inverted contribution: the shell declares a slot for UI injected into a row it owns (each todo row), and never imports the calendar plugin. Uninstalling takes the contributed field with it automatically (contributions are scope effects). |
| `src/core/views.ts` (the `Views` collection) — `scope.contribute(Views, {...})` in the calendar plugin, `useContributions(Views)` in `App.tsx` | The kernel stores contributions opaquely; the shell reads `Views` as *data* — `id` for routing, `label` for nav — instead of rendering blind. This is what makes the "dead tab" fallback exact instead of a length-based guess: it checks whether any contribution's `id` matches the current view, so it stays correct with any number of view plugins. (`todo.item.extra` above is the other shape — a slot, for when the host only needs *something rendered*, not data about what was contributed.) |
| `public/plugins.json` (manifest data) vs. `src/plugins/registry.ts` (activation code) | Manifest/activation split. The marketplace renders the "Tags" card — name, version, description — from pure JSON with no code behind it at all (shown as "Unavailable"), proving the shell can describe a plugin it can't run. |
| Uninstall Calendar, then reinstall | `src/core/todos.ts`'s `Todo` type is `{ id, title, done, createdAt } & Record<string, unknown>`. The calendar plugin reads/writes `dueDate` through that index signature; the core store persists and round-trips it without ever knowing the field exists. Uninstalling only calls `kernel.unload` — it never touches storage — so the due date survives with the UI gone, and reappears on reinstall. |
| `src/marketplace/installed.ts`, `src/bootstrap.ts` | Installed-plugin ids persist to `localStorage`; a reload calls `restoreInstalled()` before the first render, so a refresh re-installs what the user had (still an async `kernel.load`, still outside render). |

### A note on the calendar plugin's renderer factories

`src/plugins/calendar/index.tsx` doesn't define `DueDateField` or
`CalendarView` directly — it defines `makeDueDateField(todos)` and
`makeCalendarView(todos)`, functions that return the actual component. A
slot renderer's props are fixed by the `Slots` contract (`SlotRendererProps<N>`),
and a `Views` entry's `View` is a plain `ComponentType` with no props at
all, so there's no parameter slot to hand either one the `todos` store
through. The `Scope` object that has `scope.get(Todos)` only exists during
`setup`, so the closure created there — `makeCalendarView(todos)` returning
a component that closes over `todos` — is what carries the dependency
forward into a component React will call later, after `setup` has
returned. It reads as an unusual level of indirection the first time; it's
the idiomatic way a kernel-scoped plugin hands a service to a component it
contributes.

## Layout

```
src/
  kernel.ts              createKernel() at module scope
  core/todos.ts           Todos token + todosPlugin (kernel-scoped store)
  core/useTodos.ts         subscribes a component to the store
  core/views.ts            Views collection token (view descriptors: id, label, View)
  slots.ts                the host's Slots contract (todo.item.extra)
  bootstrap.ts             loads todosPlugin + previously-installed plugins, once, pre-render
  plugins/registry.ts      marketplace id -> dynamic import() of a plugin module
  plugins/calendar/        the calendar plugin: due-date field + month view, kernel-scoped
  marketplace/             manifest fetch, install/uninstall, installed-id persistence
  App.tsx, TodoList.tsx, Marketplace.tsx
```
