import type { CollectionToken, ContributionMode, Scope } from '@yatoi/kernel'
import { slot } from '@yatoi/slots'
import type { SlotName, SlotRenderer } from './types.js'

/** Ordering and composition options for a Vue slot contribution. */
export interface ContributeOptions {
  /** Higher renders first in `list` mode and wraps outermost in `single` mode. Default 0. */
  priority?: number
  /**
   * - `append` (default): one item among many; rendered by `<Slot mode="list">`.
   * - `replace`: becomes the current renderer in `<Slot mode="single">`.
   * - `wrap`: receives the current renderer as `Default` and may call through.
   */
  mode?: ContributionMode
}

/**
 * Contribute a renderer to a slot. It is a scope effect: removed when the
 * plugin's scope disposes, so uninstalling a plugin takes its UI with it.
 * Props are type-checked against the host's `Slots[N]` declaration.
 */
export function contribute<N extends SlotName>(
  scope: Scope<any>,
  name: N,
  renderer: SlotRenderer<N>,
  options?: ContributeOptions,
): void {
  // `slot()` returns CollectionToken<unknown> from the neutral package —
  // it can't know a contribution is a Vue renderer. This cast is where
  // that meaning gets assigned; the kernel itself only ever sees `unknown`.
  const token = slot(name) as CollectionToken<SlotRenderer<N>>
  scope.contribute(token, renderer, {
    ...(options?.priority !== undefined && { priority: options.priority }),
    ...(options?.mode !== undefined && { mode: options.mode }),
  })
}
