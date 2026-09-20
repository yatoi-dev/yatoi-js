import type { AnyServiceToken, CollectionToken, ServiceToken, ServiceType } from './token.js'

/**
 * Plugin activation state machine:
 *
 *   inactive ──start──▶ starting ──setup resolves──▶ active
 *      ▲                    │                           │
 *      │                    └──setup throws──▶ failed   │
 *      │                                                │
 *      └────── disposal settles ◀──── disposing ◀──stop─┘
 *
 * `inactive` means registered but waiting on dependencies (or not loaded).
 * `failed` sticks until the plugin is unloaded or one of its dependencies
 * disappears, so a broken `setup` does not retry in a hot loop.
 */
export type PluginState = 'inactive' | 'starting' | 'active' | 'disposing' | 'failed'

/**
 * A cleanup function. A returned promise is awaited before the plugin may
 * restart; any other return value is ignored (so `() => list.push(x)` is fine).
 */
export type Disposer = () => unknown

/** Well-known resolution modes. Consumers (e.g. `/slots`) may define more. */
export type ContributionMode = 'append' | 'replace' | 'wrap' | (string & {})

export interface ContributionMeta {
  /** Higher sorts first. Default 0. Ties keep insertion order. */
  readonly priority?: number
  /** Default `'append'`. The kernel stores it; it does not interpret it. */
  readonly mode?: ContributionMode
}

export interface Contribution<T> {
  readonly value: T
  readonly priority: number
  readonly mode: ContributionMode
  /** Name of the plugin that contributed. */
  readonly owner: string
}

/**
 * The synchronous snapshot React (or any observer) sees. A pending async
 * disposal is never visible here — the moment a token is removed the status
 * flips, and the promise is tracked internally.
 */
export type ServiceState<T> =
  | { readonly status: 'present'; readonly value: T }
  | { readonly status: 'absent' }
  | { readonly status: 'loading' }

export interface PluginDef<I extends readonly AnyServiceToken[] = readonly []> {
  readonly name: string
  /** Tokens this plugin may `provide`. Anything else is a setup error. */
  readonly provides?: readonly AnyServiceToken[]
  /**
   * The load-bearing declaration. The plugin activates only when every
   * token here is present, and is disposed when any of them goes away.
   */
  readonly inject?: I
  setup(scope: Scope<I>): void | Promise<void>
}

declare const PLUGIN: unique symbol

export interface Plugin<I extends readonly AnyServiceToken[] = readonly []> extends PluginDef<I> {
  readonly [PLUGIN]?: true
}

export type AnyPlugin = Plugin<readonly AnyServiceToken[]>

export interface Scope<I extends readonly AnyServiceToken[] = readonly AnyServiceToken[]> {
  /** Plugin name; useful in logs. */
  readonly name: string
  /** False once disposal has begun. Check this after any `await` in `setup`. */
  readonly active: boolean

  /**
   * Register a reversible effect. Disposers run LIFO when the scope
   * disposes. Calling `defer` on a disposed scope runs `fn` immediately.
   */
  defer(fn: Disposer): void

  /**
   * Publish a service. The token must be listed in `provides`. Removal is
   * deferred automatically. Throws if another plugin already provides it.
   */
  provide<T>(token: ServiceToken<T>, value: T): void

  /** Typed non-null for injected tokens — the graph guarantees presence. */
  get<Tok extends I[number]>(token: Tok): ServiceType<Tok>
  /** Anything not injected may be absent. */
  get<T>(token: ServiceToken<T>): T | undefined

  /** Add to a collection. Removal is deferred automatically. */
  contribute<T>(collection: CollectionToken<T>, value: T, meta?: ContributionMeta): void

  /** Load a child plugin. It is unloaded when this scope disposes. */
  load(plugin: AnyPlugin): PluginHandle
}

export interface PluginHandle {
  readonly plugin: AnyPlugin
  readonly state: PluginState
  /** Set when `state === 'failed'`. */
  readonly error: unknown
  /** Unload. Equivalent to `kernel.unload(plugin)` for top-level plugins. */
  dispose(): void
}

export type KernelErrorListener = (error: unknown, plugin: AnyPlugin) => void

export interface Kernel {
  /**
   * Register plugins. Registration is synchronous; activation is derived
   * from dependency presence and may happen immediately or later.
   * Throws if a plugin is already loaded at the top level.
   */
  load(...plugins: AnyPlugin[]): PluginHandle[]
  /**
   * Unregister a top-level plugin. Its scope disposes synchronously (async
   * disposers are tracked, not awaited). Dependents cascade. No-op if the
   * plugin is not loaded — safe to call from a React effect cleanup.
   */
  unload(plugin: AnyPlugin): void

  get<T>(token: ServiceToken<T>): T | undefined
  state<T>(token: ServiceToken<T>): ServiceState<T>
  /** Priority-sorted. Same array reference until the collection changes. */
  list<T>(collection: CollectionToken<T>): readonly Contribution<T>[]
  pluginState(plugin: AnyPlugin): PluginState

  /** Fires once per batch of changes. Pairs with `version` for `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void
  readonly version: number

  /** Errors from `setup` and disposers. Without a listener they go to `console.error`. */
  on(event: 'error', listener: KernelErrorListener): () => void

  /** Resolves when no setup or disposal is in flight. Primarily for tests. */
  settle(): Promise<void>
  /** Unload everything and wait for disposal. */
  dispose(): Promise<void>
}
