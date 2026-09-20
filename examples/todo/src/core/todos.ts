import { defineService, definePlugin } from '@yatoyi/kernel'

/**
 * The index signature is deliberate: plugins attach their own fields (the
 * calendar plugin adds `dueDate?: string`, 'YYYY-MM-DD') and this store
 * must round-trip them without knowing what they mean. See docs/design.md
 * "Manifest / activation split" — the core never imports the calendar.
 */
export type Todo = {
  id: string
  title: string
  done: boolean
  createdAt: string
} & Record<string, unknown>

export interface TodoStore {
  getAll(): readonly Todo[]
  add(title: string): void
  toggle(id: string): void
  remove(id: string): void
  patch(id: string, partial: Partial<Todo>): void
  subscribe(listener: () => void): () => void
}

export const Todos = defineService<TodoStore>('todos')

const STORAGE_KEY = 'yatoyi-todo:todos'

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
