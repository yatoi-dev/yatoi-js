import { defineCollection, type CollectionToken } from '@yatoyi/kernel'
import type { SlotName, SlotRenderer } from './types.js'

const tokens = new Map<string, CollectionToken<SlotRenderer<SlotName>>>()

/**
 * The kernel collection behind a slot name. One token per name, memoized,
 * so `contribute` and `<Slot>` agree without sharing anything but the
 * string. The kernel stores renderers as opaque values — it never learns
 * they are React components.
 *
 * The `slot:${name}` key format is a stable contract, not an implementation
 * detail: a plugin bundling its own copy of `@yatoyi/slots` reaches the same
 * collection by building that key itself, so cross-bundle interop depends
 * on this format never changing.
 */
export function slot<N extends SlotName>(name: N): CollectionToken<SlotRenderer<N>> {
  let token = tokens.get(name)
  if (!token) {
    token = defineCollection<SlotRenderer<SlotName>>(`slot:${name}`)
    tokens.set(name, token)
  }
  return token as unknown as CollectionToken<SlotRenderer<N>>
}
