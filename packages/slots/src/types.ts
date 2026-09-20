import type { ComponentType, ReactNode } from 'react'

/**
 * The host declares its contribution points by augmenting this interface.
 * Keys are slot names; values are the props a contribution receives.
 *
 * ```ts
 * declare module '@weft/slots' {
 *   interface Slots {
 *     'sidebar.item': { collapsed: boolean }
 *     'task.card': { task: Task }
 *   }
 * }
 * ```
 *
 * Props are checked on both sides: the host's `<Slot>` must pass them, and
 * a plugin's `contribute` renderer must accept them.
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
  Default: ComponentType<SlotProps<N>>
}

export type SlotRenderer<N extends SlotName> = (props: SlotRendererProps<N>) => ReactNode
