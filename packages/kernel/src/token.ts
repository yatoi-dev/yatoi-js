/**
 * Tokens are real TypeScript values, so go-to-definition, rename, and
 * find-all-references work. The `key` string is runtime identity for
 * debugging and serialization only — it is never what you type at a call
 * site. See AGENTS.md "Tokens are not bare strings".
 */

declare const TYPE: unique symbol

/** A single-value capability. Provided by exactly one active plugin at a time. */
export interface ServiceToken<T = unknown> {
  readonly kind: 'service'
  readonly key: string
  /** Phantom slot carrying `T`. Never set at runtime. */
  readonly [TYPE]?: (value: T) => T
}

/**
 * A multi-value contribution point. Many plugins may contribute; the kernel
 * stores the values opaquely and hands back a priority-sorted list. `/slots`
 * is built on this — the kernel never knows a value is a React component.
 */
export interface CollectionToken<T = unknown> {
  readonly kind: 'collection'
  readonly key: string
  readonly [TYPE]?: (value: T) => T
}

export type AnyServiceToken = ServiceToken<any>

/** Extracts the value type of a token. */
export type ServiceType<Tok> = Tok extends ServiceToken<infer T> ? T : never

export function defineService<T>(key: string): ServiceToken<T> {
  return Object.freeze({ kind: 'service', key }) as ServiceToken<T>
}

export function defineCollection<T>(key: string): CollectionToken<T> {
  return Object.freeze({ kind: 'collection', key }) as CollectionToken<T>
}
