import { useSyncExternalStore } from 'react'
import type { Todo, TodoStore } from './todos.js'

/**
 * Deliberately not `useService(Todos)` — by the time a component can call
 * this, `<Requires of={[Todos]}>` has already proven the store is present
 * and handed it down. This hook only owns "re-render when the data
 * changes", via the same `useSyncExternalStore` bridge the kernel itself
 * uses, so React's concurrent rendering can't tear.
 */
export function useTodos(store: TodoStore): readonly Todo[] {
  return useSyncExternalStore(store.subscribe, store.getAll)
}
