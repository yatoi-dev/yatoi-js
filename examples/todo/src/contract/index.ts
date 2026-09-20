/**
 * The contract — what the host and its plugins agree on: tokens and
 * types, no behaviour. The host *implements* `Todos` (see
 * examples/todo/src/core/todos.ts) and owns the shell side of `Views` and
 * `'todo.item.extra'`; plugins depend on this folder to *consume* those
 * without importing the host's source.
 *
 * In a real product this folder is what you'd publish as a package, so
 * third-party plugins can build against it without vendoring the host's
 * source tree. Here it stays a folder inside the host for the same reason
 * chapter 1 of the example is one package: less to set up before you see
 * a single `contribute()`.
 *
 * A plugin may bundle its own copy of this contract (and of
 * `@yatoi/kernel` and `@yatoi/slots`) instead of taking a runtime
 * dependency on the host's copies — see packages/kernel/src/token.ts: a
 * token's identity is its string `key`, not the object
 * `defineService`/`defineCollection` returned, so two independently
 * bundled `Todos` tokens still name the same capability to the host's
 * kernel. `src/plugins/calendar` is built exactly this way for chapter 2
 * of the README, as a standalone ESM file loaded by URL.
 */
import './slots.js'

export { Todos, type Todo, type TodoStore } from './todos.js'
export { Views, type ViewDescriptor } from './views.js'
export { useTodos } from './useTodos.js'
