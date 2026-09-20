import { defineService } from '@yatoyi/kernel'

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

/**
 * The host implements this token (see examples/todo/src/core/todos.ts);
 * this package only ships the token and the types plugins need to talk to
 * it. Identity is by `Todos.key` ('todos'), not by this object — a plugin
 * bundle may `defineService<TodoStore>('todos')` itself instead of
 * depending on this package and still resolve the host's store.
 */
export const Todos = defineService<TodoStore>('todos')
