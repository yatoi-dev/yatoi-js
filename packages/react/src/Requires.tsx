import { useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { AnyServiceToken, ServiceType } from '@yatoi/kernel'
import { useKernel } from './context.js'

type Values<Tokens extends readonly AnyServiceToken[]> = {
  [K in keyof Tokens]: ServiceType<Tokens[K]>
}

export interface RequiresProps<Tokens extends readonly AnyServiceToken[]> {
  /** Services this subtree cannot exist without. */
  of: Tokens
  /** Rendered while any of them is absent or loading. */
  fallback?: ReactNode
  /** Receives the services, typed non-null — the kernel guarantees presence here. */
  children: (...services: Values<Tokens>) => ReactNode
}

/**
 * The React expression of cascade unload. When any required service goes
 * away, this subtree *unmounts* — its effects clean up — instead of
 * re-rendering with `undefined` and crashing three components deep. When
 * the service returns, the subtree mounts fresh.
 */
export function Requires<const Tokens extends readonly AnyServiceToken[]>({
  of,
  fallback = null,
  children,
}: RequiresProps<Tokens>) {
  const kernel = useKernel()
  const cache = useRef<readonly unknown[] | null>(null)

  const read = useCallback((): readonly unknown[] | null => {
    const next: unknown[] = []
    for (const token of of) {
      const value = kernel.get(token)
      if (value === undefined) {
        cache.current = null
        return null
      }
      next.push(value)
    }
    // Same tuple reference while every value is identical — keeps children from re-rendering on unrelated kernel changes.
    const prev = cache.current
    if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) return prev
    cache.current = next
    return next
    // `of` is expected to be a stable literal; spread its keys so an inline array still works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel, ...of.map((t) => t.key)])

  const values = useSyncExternalStore(kernel.subscribe, read, read)
  if (values === null) return <>{fallback}</>
  return <>{children(...(values as Values<Tokens>))}</>
}
