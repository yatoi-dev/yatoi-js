import { onScopeDispose, shallowReadonly, shallowRef, type ShallowRef } from 'vue'
import type { ServiceState, ServiceToken } from '@yatoi/kernel'
import { useKernel } from './context.js'

/**
 * A read-only ref tracking the stored value, or `undefined` while absent.
 * The reference is the one the plugin provided, so it is stable for as
 * long as it is present.
 *
 * Vue has no `useSyncExternalStore`; the tearing-safe primitive here is
 * `kernel.subscribe` plus a `shallowRef` that is only *written* when
 * `kernel.get(token)` actually changed (`!==` the ref's current value).
 * Vue's reactivity can't tear the way concurrent React can, but the
 * identity check still matters: it's what keeps effects and renders that
 * read this ref from re-running on kernel changes unrelated to `token`.
 *
 * Unsubscribes via `onScopeDispose`, so this works inside a component's
 * `setup()` and inside a plain composable called from one.
 *
 * Reaching for a non-null assertion on the result is the trap this API
 * sets, same as React — use `Requires` when a subtree cannot exist
 * without the service.
 */
export function useService<T>(token: ServiceToken<T>): Readonly<ShallowRef<T | undefined>> {
  const kernel = useKernel()
  const ref = shallowRef<T | undefined>(kernel.get(token))
  const unsubscribe = kernel.subscribe(() => {
    const next = kernel.get(token)
    if (next !== ref.value) ref.value = next
  })
  onScopeDispose(unsubscribe)
  return shallowReadonly(ref) as Readonly<ShallowRef<T | undefined>>
}

/**
 * `present | absent | loading` snapshot, as a read-only ref. Object
 * identity is stable while status and value are unchanged, so it is safe
 * to use as a `watch` source or in a `computed` dependency — same
 * guarantee as React's `useServiceState`.
 */
export function useServiceState<T>(token: ServiceToken<T>): Readonly<ShallowRef<ServiceState<T>>> {
  const kernel = useKernel()
  const ref = shallowRef<ServiceState<T>>(kernel.state(token))
  const unsubscribe = kernel.subscribe(() => {
    const next = kernel.state(token)
    if (!sameState(ref.value, next)) ref.value = next
  })
  onScopeDispose(unsubscribe)
  return shallowReadonly(ref) as Readonly<ShallowRef<ServiceState<T>>>
}

function sameState<T>(a: ServiceState<T>, b: ServiceState<T>): boolean {
  if (a.status !== b.status) return false
  return a.status !== 'present' || b.status !== 'present' || a.value === b.value
}
