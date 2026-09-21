/**
 * The contract — what the host and its plugins agree on: tokens and
 * types, no behaviour. The host *implements* `Todos` (see
 * examples/todo-vue/src/core/todos.ts) and owns the shell side of `Views`
 * and `'todo.item.extra'`; plugins depend on this folder to *consume*
 * those without importing the host's source. Same shape as the React
 * example's `src/contract`, ported field for field — see that folder's
 * doc comment for the fuller rationale (publishing this as its own
 * package, third-party bundling, etc.), not repeated here.
 */
import './slots.js'

export { Todos, type Todo, type TodoStore } from './todos.js'
export { Views, type ViewDescriptor } from './views.js'
export { useTodos } from './useTodos.js'
