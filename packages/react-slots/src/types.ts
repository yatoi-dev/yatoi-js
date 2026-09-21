import type { ComponentType, ReactNode } from 'react'
import type { SlotName, SlotProps } from '@yatoi/slots'

export type { Slots, SlotName, SlotProps } from '@yatoi/slots'

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
