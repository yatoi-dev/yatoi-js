import { defineCollection, type CollectionToken } from '@yatoi/kernel'
import type { SlotName, SlotRenderer } from './types.js'

const tokens = new Map<string, CollectionToken<SlotRenderer<SlotName>>>()

/**
 * The kernel collection behind a slot name. One token per name, memoized,
 * so `contribute` and `<Slot>` agree without sharing anything but the
 * string. The kernel stores renderers as opaque values — it never learns
 * they are Vue components.
 *
 * The `slot:${name}` key format is **the same one `@yatoi/slots` uses**
 * (§2.5) — this is what makes it a stable cross-binding contract rather
 * than an implementation detail. A plugin bundling its own copy of
 * `@yatoi/vue-slots` reaches the same collection by building that key
 * itself; so, in principle, could a React plugin contributing to a slot a
 * Vue host renders (and vice versa), as long as the two sides agree on
 * what a "renderer" is out of band. Cross-*framework* interop isn't
 * something either binding promises — cross-*bundle* interop within one
 * framework is (see the test of the same name).
 */
export function slot<N extends SlotName>(name: N): CollectionToken<SlotRenderer<N>> {
  let token = tokens.get(name)
  if (!token) {
    token = defineCollection<SlotRenderer<SlotName>>(`slot:${name}`)
    tokens.set(name, token)
  }
  return token as unknown as CollectionToken<SlotRenderer<N>>
}
