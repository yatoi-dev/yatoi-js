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

/**
 * The contributed values only, in collection order — `useContributions`
 * minus the `Contribution<T>` wrapper, for the common case that just
 * wants `T[]` and not `priority`/`mode`/`owner`. Reading
 * `contributions.value.find(c => c.value.id === x)` has two `.value`s
 * meaning different things (the outer ref, the inner `Contribution`);
 * this skips the inner one.
 *
 * Same subscription and stability contract as `useContributions`: the
 * returned array reference is cached on the underlying `kernel.list()`
 * reference, so it stays stable — and doesn't trigger unrelated
 * `watch`/render effects — for as long as the collection itself hasn't
 * changed, even though this ref computes a new mapped array from it.
 */
export function useContributionValues<T>(collection: CollectionToken<T>): Readonly<ShallowRef<readonly T[]>> {
  const kernel = useKernel()
  let sourceContributions = kernel.list(collection)
  let values = sourceContributions.map((c) => c.value)
  const ref = shallowRef<readonly T[]>(values)
  const unsubscribe = kernel.subscribe(() => {
    const next = kernel.list(collection)
    if (next !== sourceContributions) {
      sourceContributions = next
      values = next.map((c) => c.value)
      ref.value = values
    }
  })
  onScopeDispose(unsubscribe)
  return shallowReadonly(ref) as Readonly<ShallowRef<readonly T[]>>
}
