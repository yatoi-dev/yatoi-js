import type { FunctionalComponent } from 'vue'
import type { SlotName, SlotProps } from '@yatoi/slots'

export type { Slots, SlotName, SlotProps } from '@yatoi/slots'

/**
 * What a contribution receives: the slot's props plus `Default`, the
 * renderer it sits on top of (the host default, or a lower-priority
 * contribution). `wrap` contributions call through to it; `append` and
 * `replace` contributions usually ignore it.
 */
export type SlotRendererProps<N extends SlotName> = SlotProps<N> & {
  /** Host default or next lower-priority renderer in a `wrap` chain. */
  Default: FunctionalComponent<SlotProps<N>>
}

/**
 * A contribution is a Vue component. Functional components — a plain
 * `(props) => VNode` — count, and are what `contribute()` and `<Slot>`
 * itself produce internally.
 */
export type SlotRenderer<N extends SlotName> = FunctionalComponent<SlotRendererProps<N>>
