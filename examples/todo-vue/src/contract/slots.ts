import type { Todo } from './todos.js'
// TS's rule for augmenting an external module: the module must be
// referenced by an actual import somewhere in the program with that exact
// specifier, or the augmentation is "not found" even when it resolves.
// Nothing else in this package otherwise imports '@yatoi/vue-slots' (this
// package only needs its types), so this otherwise-inert import supplies
// that reference.
import type {} from '@yatoi/vue-slots'

/**
 * The host's contribution contract, declaration-merged into
 * `@yatoi/vue-slots`' empty `Slots` interface (docs/design.md
 * "Declaration-merged registry interface"). It lives here, in the
 * contract, rather than elsewhere in the host app so that a plugin
 * depending only on this contract — never on the rest of the host's
 * source — still gets this merge into its own compilation, and so a
 * plugin bundling its own copy of the contract still targets the same
 * slot key (`slot:todo.item.extra`, see packages/vue-slots/src/token.ts)
 * as the host.
 *
 * This is a *separate* augmentation from the React example's
 * `@yatoi/slots` `Slots` interface — see packages/vue-slots/src/types.ts's
 * doc comment on why the two contracts can't merge.
 */
declare module '@yatoi/vue-slots' {
  interface Slots {
    /** Extra controls rendered inside each todo row (e.g. a due-date field). */
    'todo.item.extra': { todo: Todo }
  }
}
