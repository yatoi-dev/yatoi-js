/**
 * The host declares its contribution points by augmenting this interface.
 * Keys are slot names; values are the props a contribution receives.
 *
 * Augment **this** module — `@yatoi/slots` — once, regardless of how many
 * framework bindings the host uses:
 *
 * ```ts
 * declare module '@yatoi/slots' {
 *   interface Slots {
 *     'sidebar.item': { collapsed: boolean }
 *     'task.card': { task: Task }
 *   }
 * }
 * ```
 *
 * `Slots` is one interface in one module; every binding's `contribute()`
 * and `<Slot>` re-export `SlotName`/`SlotProps` from here, so they all
 * type-check against the same augmentation without the host declaring it
 * twice. Framework-specific shapes (what a contribution receives beyond
 * its own props, what a renderer *is*) live in each binding package, not
 * here — this package only owns the contract's neutral half: names and
 * prop shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Slots {}

export type SlotName = keyof Slots & string

export type SlotProps<N extends SlotName> = Slots[N]
