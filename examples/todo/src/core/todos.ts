import { definePlugin } from '@yatoi/kernel'
import { Todos, type Todo, type TodoStore } from '../contract/index.js'
import { kernel } from '../kernel.js'

// The `Todos` token and the `Todo`/`TodoStore` types live in `../contract`
// now — both the host (this file, the implementation) and any plugin
// depend on that folder to agree on the shape without the plugin
// importing this file. Re-exported here so the rest of the host can keep
// importing them from `./core/todos.js`.
export { Todos, type Todo, type TodoStore }

const STORAGE_KEY = 'yatoi-todo:todos'

function load(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Todo[]) : []
  } catch {
    return []
  }
}

function save(todos: readonly Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  } catch {
    // Storage full or unavailable (private browsing) — the session still
    // works, it just won't persist. Not worth surfacing in a demo app.
  }
}

function createTodoStore(): TodoStore {
  // `todos` only ever gets a new array on mutation, so `getAll()` returns a
  // stable reference in between — cheap for `useSyncExternalStore`.
  let todos = load()
  const listeners = new Set<() => void>()

  function commit(next: Todo[]): void {
    todos = next
    save(todos)
    for (const listener of listeners) listener()
  }

  return {
    getAll: () => todos,

    add(title) {
      const trimmed = title.trim()
      if (!trimmed) return
      const todo: Todo = {
        id: crypto.randomUUID(),
        title: trimmed,
        done: false,
        createdAt: new Date().toISOString(),
      }
      commit([...todos, todo])
    },

    toggle(id) {
      commit(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    },

    remove(id) {
      commit(todos.filter((t) => t.id !== id))
    },

    patch(id, partial) {
      commit(todos.map((t) => (t.id === id ? { ...t, ...partial } : t)))
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Kernel-scoped: the store outlives every render tree and is never itself
 * a component. This is the composition unit React has no home for (see
 * docs/design.md "A composition unit that isn't a render-tree node").
 */
export const todosPlugin = definePlugin({
  name: 'todos',
  provides: [Todos],
  setup(scope) {
    scope.provide(Todos, createTodoStore())
  },
})

// HMR replaces this module's exports with new objects (same `name`, new
// identity). Without this, the old `todosPlugin` stays loaded and the new
// one fails trying to provide `Todos` a second time. See docs/pitfalls.md
// "HMR replaces plugin objects".
if (import.meta.hot) {
  import.meta.hot.dispose(() => kernel.unload(todosPlugin))
}
