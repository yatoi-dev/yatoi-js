import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { ServiceState, ServiceToken } from '@yatoi/kernel'
import { useKernel } from './context.js'

/**
 * The stored value, or `undefined` while absent. The reference is the
 * one the plugin provided, so it is stable for as long as it is present.
 *
 * Reaching for `!` on the result is the trap this API sets — use
 * `<Requires>` when a subtree cannot exist without the service.
 */
export function useService<T>(token: ServiceToken<T>): T | undefined {
  const kernel = useKernel()
  const read = useCallback(() => kernel.get(token), [kernel, token])
  return useSyncExternalStore(kernel.subscribe, read, read)
}

/**
 * `present | absent | loading` snapshot. Object identity is stable while
 * the status and value are unchanged, so it is safe in dependency arrays.
 */
export function useServiceState<T>(token: ServiceToken<T>): ServiceState<T> {
  const kernel = useKernel()
  const last = useRef<ServiceState<T> | null>(null)
  const read = useCallback(() => {
    const next = kernel.state(token)
    const prev = last.current
    if (prev && sameState(prev, next)) return prev
    last.current = next
    return next
  }, [kernel, token])
  return useSyncExternalStore(kernel.subscribe, read, read)
}

function sameState<T>(a: ServiceState<T>, b: ServiceState<T>): boolean {
  if (a.status !== b.status) return false
  return a.status !== 'present' || b.status !== 'present' || a.value === b.value
}
