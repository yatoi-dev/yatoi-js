import { onScopeDispose, shallowReadonly, shallowRef, type ShallowRef } from 'vue'
import type { CollectionToken, Contribution } from '@yatoi/kernel'
import { useKernel } from './context.js'

/**
 * Priority-sorted contributions to a collection, as a read-only ref. The
 * kernel returns the same array reference until the collection changes,
 * so the ref is only written then. `@yatoi/vue-slots` builds `<Slot>` on
 * top of this, same layering as `@yatoi/react-slots` over `@yatoi/react`.
 */
export function useContributions<T>(
  collection: CollectionToken<T>,
): Readonly<ShallowRef<readonly Contribution<T>[]>> {
  const kernel = useKernel()
  const ref = shallowRef(kernel.list(collection))
  const unsubscribe = kernel.subscribe(() => {
    const next = kernel.list(collection)
    if (next !== ref.value) ref.value = next
  })
  onScopeDispose(unsubscribe)
  return shallowReadonly(ref) as Readonly<ShallowRef<readonly Contribution<T>[]>>
}
