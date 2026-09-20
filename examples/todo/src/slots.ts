import type { Todo } from './core/todos.js'

/**
 * The host's contribution contract. Declaration-merged into `@yatoyi/slots`'
 * empty `Slots` interface (CLAUDE.md "Declaration-merged registry
 * interface") — third parties augment this without the app shipping them a
 * token. Must be imported somewhere reachable from `main.tsx` so the merge
 * is part of the program before any `<Slot>` or `contribute()` type-checks.
 */
declare module '@yatoyi/slots' {
  interface Slots {
    /** Extra controls rendered inside each todo row (e.g. a due-date field). */
    'todo.item.extra': { todo: Todo }
  }
}
