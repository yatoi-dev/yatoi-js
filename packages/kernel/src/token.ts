/**
 * Tokens are real TypeScript values, so go-to-definition, rename, and
 * find-all-references work. The `key` string is runtime identity for
 * debugging and serialization only — it is never what you type at a call
 * site. See docs/design.md "Tokens are not bare strings".
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

/**
 * Two ways to get a typed token, because identity is by `key` (see the file
 * comment above) rather than by object, so both can name the same capability:
 *
 * - **Imported token objects** — `defineService`/`defineCollection`, shared
 *   via a contract package the provider and consumers both depend on. The
 *   documented default: best go-to-definition/rename support, and since
 *   identity is by key a plugin may even bundle its own copy of the contract
 *   package instead of depending on the host's.
 * - **Registry interface** — augment this interface (or `Collections`) and
 *   call `service`/`collection`. For a third-party plugin that cannot take a
 *   dependency on the host's contract package: the host publishes only
 *   types, e.g. `declare module '@yatoi/kernel' { interface Services {
 *   todos: TodoStore } }`, and the plugin calls `service('todos')` with no
 *   import beyond `@yatoi/kernel` itself.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Services {}
/** Same as {@link Services}, for collections. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Collections {}

export type ServiceKey = keyof Services & string
export type CollectionKey = keyof Collections & string

export function service<K extends ServiceKey>(key: K): ServiceToken<Services[K]> {
  return defineService(key)
}

export function collection<K extends CollectionKey>(key: K): CollectionToken<Collections[K]> {
  return defineCollection(key)
}
