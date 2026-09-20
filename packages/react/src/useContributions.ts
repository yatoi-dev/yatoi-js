import { useCallback, useSyncExternalStore } from 'react'
import type { CollectionToken, Contribution } from '@yatoi/kernel'
import { useKernel } from './context.js'

/**
 * Priority-sorted contributions to a collection. The kernel returns the
 * same array reference until the collection changes, so this is cheap to
 * depend on. `/slots` builds `<Slot>` on top of this.
 */
export function useContributions<T>(collection: CollectionToken<T>): readonly Contribution<T>[] {
  const kernel = useKernel()
  const read = useCallback(() => kernel.list(collection), [kernel, collection])
  return useSyncExternalStore(kernel.subscribe, read, read)
}
