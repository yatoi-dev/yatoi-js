# yatoi todo example

A small todo app with an installable calendar plugin, exercising
`@yatoi/kernel`, `@yatoi/react`, `@yatoi/slots`, and `@yatoi/react/slots`
end to end.

## Run it

```bash
pnpm --filter yatoi-example-todo dev
```

That's chapter 1 — the whole app, one server, on `:5173`. Chapter 2 below
shows the same calendar plugin delivered as a separately built file from
another origin, the way a plugin from a CDN would arrive; it's opt-in and
needs a second terminal.

## Chapter 1 — the app

```
src/
  main.tsx, App.tsx, TodoList.tsx, Marketplace.tsx, styles.css
  kernel.ts                  createKernel() at module scope
  bootstrap.ts                loads todosPlugin + previously-installed plugins, once, pre-render
  core/todos.ts                todosPlugin (kernel-scoped store); imports the Todos token + types
                                from ../contract
  contract/                    tokens + types the host and its plugins agree on, no behaviour —
                                index.ts, todos.ts, views.ts, useTodos.ts, slots.ts
  plugins/
    registry.ts                 id → () => import('./calendar/index.js') — the code side of the
                                 manifest (public/plugins.json is the data side)
    calendar/index.tsx           the plugin: due-date field + month view + style injection,
                                  kernel-scoped; imports the contract from ../../contract
    calendar/calendar.css        ships with the plugin, injected as a <style> in setup(),
                                  removed on dispose
  marketplace/
    installed.ts                 installed-plugin ids, persisted to localStorage
    useMarketplace.ts            manifest fetch, install/uninstall, installed-id persistence
public/plugins.json           manifest: id, name, version, description — data only
vite.config.ts                 aliases + react() + reactImportMap()  (chapter 2, harmless here)
index.html, package.json
```

`src/shared/*`, `vite/react-import-map.ts`, and `vite.plugin.config.ts` are
chapter 2 — see below.

### What demonstrates what

| In the app | Demonstrates |
|---|---|
| `src/core/todos.ts` — `todosPlugin`, kernel-scoped, loaded once in `src/bootstrap.ts` before React renders | A composition unit that isn't a render-tree node — the store outlives every render, React only observes it. |
| `src/App.tsx` — `<Requires of={[Todos]} fallback={...}>` | Capability-level lifecycle: the shell doesn't handle "todos is undefined" as a render case, it never renders that subtree without it. |
| `src/contract/slots.ts` (the `Slots` augmentation) + `<Slot name="todo.item.extra">` in `TodoList.tsx` + `contribute()` in the calendar plugin | Inverted contribution: the shell declares a slot for UI injected into a row it owns (each todo row), and never imports the calendar plugin. Uninstalling takes the contributed field with it automatically (contributions are scope effects). |
| `src/contract/views.ts` (the `Views` collection) — `scope.contribute(Views, {...})` in the calendar plugin, `useContributions(Views)` in `App.tsx` | The kernel stores contributions opaquely; the shell reads `Views` as *data* — `id` for routing, `label` for nav — instead of rendering blind. This is what makes the "dead tab" fallback exact instead of a length-based guess: it checks whether any contribution's `id` matches the current view, so it stays correct with any number of view plugins. (`todo.item.extra` above is the other shape — a slot, for when the host only needs *something rendered*, not data about what was contributed.) |
| `public/plugins.json` (manifest data) vs. `src/plugins/registry.ts` (activation code) | Manifest/activation split. The marketplace renders the "Tags" card — name, version, description — from pure JSON with no code registered for it at all (shown as "Unavailable"), proving the shell can describe a plugin it can't run. |
| Uninstall Calendar, then reinstall | The contract's `Todo` type is `{ id, title, done, createdAt } & Record<string, unknown>`. The calendar plugin reads/writes `dueDate` through that index signature; the core store persists and round-trips it without ever knowing the field exists. Uninstalling only calls `kernel.unload` — it never touches storage — so the due date survives with the UI gone, and reappears on reinstall. Uninstalling also removes the plugin's injected `<style>` element (`src/plugins/calendar/index.tsx`) — styles are a scope effect too, not just UI. |
| `src/marketplace/installed.ts`, `src/bootstrap.ts` | Installed-plugin ids persist to `localStorage`; a reload calls `restoreInstalled()` before the first render, re-activating each installed plugin, so a refresh re-installs what the user had (still an async `kernel.load`, still outside render). |

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

## Chapter 2 — the same plugin, delivered as a file

Chapter 1's `registry.ts` bundles the calendar plugin with the app — fine
for a plugin the app author ships. A real marketplace also serves plugins
from a CDN: built independently, deployed independently, fetched by URL at
runtime. The plugin's *code* doesn't change between the two — only where
it comes from. For that to work: the plugin's build must externalize
React and share the host's instance (see below), and it must not assume
it's in the same JS bundle as the host (no importing host source directly
— see the contract note at the end of this section).

### Run it

Two terminals:

```bash
# terminal 1 — builds the calendar plugin and serves dist-plugin/ on :5174 with CORS
pnpm --filter yatoi-example-todo serve:plugin

# terminal 2 — the host, on :5173, resolving plugin ids against :5174 instead of the registry
pnpm --filter yatoi-example-todo dev:remote
```

### What to look at

- **Network tab**: installing Calendar fetches `calendar.js` from
  `http://localhost:5174`, with a clean URL (no query string on a first,
  successful attempt).
- That file carries its own tree-shaken copy of `@yatoi/kernel`,
  `@yatoi/slots`, `@yatoi/react/slots`, and the contract, and still
  interoperates with the host's kernel by token key, not by shared module
  instance — see `packages/kernel/test/kernel.test.ts` block 11 and
  `packages/react/test/react-slots.test.tsx` "cross-bundle interop"
  for the same guarantee, tested directly.
- **React is the one thing that *is* shared**, via a native import map —
  see `vite/react-import-map.ts` and
  [Pitfalls](../../docs/pitfalls.md#share-react-not-yatoi) for why a
  second React instance breaks hooks.
- **Tags** shows "Failed to load" here (chapter 1 shows "Unavailable" for
  it) — there's no `tags.js` on `:5174`, and in remote mode every manifest
  id is attemptable, so a missing file surfaces as a load failure instead
  of being filtered out ahead of time.
- Month navigation in the calendar view still works — that's local
  `useState` in a plugin running against the host's React dispatcher; if
  React weren't properly shared this is where "Invalid hook call" would
  show up.
- Uninstalling removes the plugin's injected `<style>` the same as in
  chapter 1.
- Stop the `:5174` server and reload: the Calendar card shows "Failed to
  load" with **Retry** and **Remove**. Restart `:5174` and click **Retry**
  — the request now carries `?_retry=…` (the browser's module cache
  already remembers the clean URL as a failure) and succeeds.

### The one thing that changes

`src/plugins/calendar/index.tsx` imports the contract with a relative
path, `../../contract/index.js`, because here the contract is a folder
inside this same package. In a real product that folder is what you'd
publish instead, and a separately-deployed plugin would depend on it as a
package. That's the *only* thing that would change in the plugin's
source — everything else in this section (externalizing React, bundling
the kernel/slots copies, the manifest/registry split) is unchanged.

### Chapter 2 files

- `vite.plugin.config.ts` — builds `src/plugins/calendar/index.tsx` to
  `dist-plugin/calendar.js` in lib mode, externalizing only `react`,
  `react/jsx-runtime`, and `react-dom`; `preview` serves that directory on
  `:5174` with CORS.
- `vite/react-import-map.ts` — the Vite plugin that shares the host's
  React instance with any plugin loaded by URL (import map + the shim
  build entries).
- `src/shared/react.ts`, `src/shared/jsx-runtime.ts` — this app's own
  React re-exported under real, individually named ESM bindings, so a
  remote bundle's `import 'react'` has something concrete to resolve to.
- The `VITE_PLUGIN_BASE` seam in `src/marketplace/useMarketplace.ts` —
  the one `if` that switches a manifest id from resolving through
  `src/plugins/registry.ts` to resolving against another origin.
