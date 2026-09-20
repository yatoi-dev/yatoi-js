import type { ContributionMode, Scope } from '@yatoyi/kernel'
import { slot } from './token.js'
import type { SlotName, SlotRenderer } from './types.js'

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
  scope.contribute(slot(name), renderer, {
    ...(options?.priority !== undefined && { priority: options.priority }),
    ...(options?.mode !== undefined && { mode: options.mode }),
  })
}
