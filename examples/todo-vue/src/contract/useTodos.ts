import { onScopeDispose, shallowRef, type ShallowRef } from 'vue'
import type { Todo, TodoStore } from './todos.js'

/**
 * Deliberately not `useService(Todos)` — by the time a component can call
 * this, `<Requires :of="[Todos]">` has already proven the store is present
 * and handed it down. This composable only owns "re-render when the data
 * changes": a `shallowRef` written on every `store.subscribe` notification
 * (the store always hands back a fresh array on mutation — see
 * core/todos.ts — so there's no identity check to make here the way
 * `@yatoi/vue`'s own composables do against the kernel).
 */
export function useTodos(store: TodoStore): Readonly<ShallowRef<readonly Todo[]>> {
  const ref = shallowRef<readonly Todo[]>(store.getAll())
  const unsubscribe = store.subscribe(() => {
    ref.value = store.getAll()
  })
  onScopeDispose(unsubscribe)
  return ref
}
