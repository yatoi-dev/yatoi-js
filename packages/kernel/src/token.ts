/**
 * Tokens are real TypeScript values, so go-to-definition, rename, and
 * find-all-references work. The `key` string is runtime identity for
 * debugging and serialization only — it is never what you type at a call
 * site. See docs/design.md "Tokens are not bare strings".
 */

declare const TYPE: unique symbol

/** A single-value capability. Provided by exactly one active plugin at a time. */
export interface ServiceToken<T = unknown> {
  /** Discriminant separating services from collections. */
  readonly kind: 'service'
  /** Runtime capability identity; define and export the token from one contract module. */
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
  /** Discriminant separating collections from services. */
  readonly kind: 'collection'
  /** Runtime contribution-point identity. */
  readonly key: string
  /** Phantom slot carrying `T`. Never set at runtime. */
  readonly [TYPE]?: (value: T) => T
}

/** Service token with an erased value type, used at generic graph boundaries. */
export type AnyServiceToken = ServiceToken<any>

/** Extracts the value type of a token. */
export type ServiceType<Tok> = Tok extends ServiceToken<infer T> ? T : never

/**
 * Define a typed single-provider capability token.
 *
 * @example
 * ```ts
 * import { defineService } from '@yatoi/kernel'
 * export interface Clock { now(): number }
 * export const Clock = defineService<Clock>('clock')
 * ```
 */
export function defineService<T>(key: string): ServiceToken<T> {
  return Object.freeze({ kind: 'service', key }) as ServiceToken<T>
}

/**
 * Define a typed multi-provider contribution token.
 *
 * @example
 * ```ts
 * import { defineCollection } from '@yatoi/kernel'
 * export interface Command { name: string; run(): void }
 * export const Commands = defineCollection<Command>('commands')
 * ```
 */
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

/** Keys declared through module augmentation of {@link Services}. */
export type ServiceKey = keyof Services & string
/** Keys declared through module augmentation of {@link Collections}. */
export type CollectionKey = keyof Collections & string

/**
 * Create a service token from the augmented {@link Services} registry.
 * Prefer an imported `defineService` token when a shared contract module is available.
 *
 * @example
 * ```ts
 * import { service } from '@yatoi/kernel'
 * declare module '@yatoi/kernel' { interface Services { clock: { now(): number } } }
 * const Clock = service('clock')
 * ```
 */
export function service<K extends ServiceKey>(key: K): ServiceToken<Services[K]> {
  return defineService(key)
}

/**
 * Create a collection token from the augmented {@link Collections} registry.
 * Prefer an imported `defineCollection` token when a shared contract module is available.
 *
 * @example
 * ```ts
 * import { collection } from '@yatoi/kernel'
 * declare module '@yatoi/kernel' { interface Collections { commands: string } }
 * const Commands = collection('commands')
 * ```
 */
export function collection<K extends CollectionKey>(key: K): CollectionToken<Collections[K]> {
  return defineCollection(key)
}
