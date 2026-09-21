import { defineCollection, type CollectionToken } from '@yatoi/kernel'
import type { SlotName } from './types.js'

const tokens = new Map<string, CollectionToken<unknown>>()

/**
 * The kernel collection behind a slot name. One token per name, memoized,
 * so every binding's `contribute` and `<Slot>` agree without sharing
 * anything but the string. The kernel stores contributions as opaque
 * values — this package never learns what a "renderer" is; each binding
 * narrows `CollectionToken<unknown>` to its own `CollectionToken<SlotRenderer<N>>`
 * at the boundary (one cast, in that binding's `contribute`/`Slot`) — that
 * cast is where React or Vue meaning gets assigned, not a hack around a
 * missing type.
 *
 * The `slot:${name}` key format is a stable cross-bundle contract (spec
 * §2.5), not an implementation detail: a plugin bundling its own copy of
 * a binding reaches the same collection by building that key itself. This
 * package is its only home now — both `@yatoi/react-slots` and
 * `@yatoi/vue-slots` re-export this `slot()` rather than defining their
 * own, so a React contribution and a Vue contribution to the same slot
 * name always land in the same kernel collection.
 */
export function slot<N extends SlotName>(name: N): CollectionToken<unknown> {
  let token = tokens.get(name)
  if (!token) {
    token = defineCollection<unknown>(`slot:${name}`)
    tokens.set(name, token)
  }
  return token
}
