import type { FunctionalComponent } from 'vue'

/**
 * The host declares its contribution points by augmenting this interface.
 * Keys are slot names; values are the props a contribution receives.
 *
 * ```ts
 * declare module '@yatoi/vue-slots' {
 *   interface Slots {
 *     'sidebar.item': { collapsed: boolean }
 *     'task.card': { task: Task }
 *   }
 * }
 * ```
 *
 * This is a **separate contract from `@yatoi/slots`'s `Slots`**, even
 * though the shape and the augmentation pattern are identical. A host
 * using both React and Vue surfaces for the same product declares its
 * slots twice, once per binding — renderers are framework-specific
 * (`ComponentType` vs. `FunctionalComponent`), so the two interfaces
 * can't be merged without coupling `@yatoi/slots` to Vue or vice versa.
 * What *is* shared, byte for byte, is the collection key format
 * (`slot:<name>`, §2.5) — see `token.ts`.
 *
 * Props are checked on both sides: the host's `<Slot>` must pass them,
 * and a plugin's `contribute` renderer must accept them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Slots {}

export type SlotName = keyof Slots & string

export type SlotProps<N extends SlotName> = Slots[N]

/**
 * What a contribution receives: the slot's props plus `Default`, the
 * renderer it sits on top of (the host default, or a lower-priority
 * contribution). `wrap` contributions call through to it; `append` and
 * `replace` contributions usually ignore it.
 */
export type SlotRendererProps<N extends SlotName> = SlotProps<N> & {
  Default: FunctionalComponent<SlotProps<N>>
}

/**
 * A contribution is a Vue component. Functional components — a plain
 * `(props) => VNode` — count, and are what `contribute()` and `<Slot>`
 * itself produce internally.
 */
export type SlotRenderer<N extends SlotName> = FunctionalComponent<SlotRendererProps<N>>
