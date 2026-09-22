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

/** Ordering and composition metadata for one collection contribution. */
export interface ContributionMeta {
  /** Higher sorts first. Default 0. Ties keep insertion order. */
  readonly priority?: number
  /** Default `'append'`. The kernel stores it; it does not interpret it. */
  readonly mode?: ContributionMode
}

/** A value in a collection together with its composition metadata and owner. */
export interface Contribution<T> {
  /** Opaque value supplied by the contributing plugin. */
  readonly value: T
  /** Sort priority, higher first. */
  readonly priority: number
  /** Composition hint stored verbatim by the kernel. */
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

/** Declarative dependency contract and activation procedure for a plugin. */
export interface PluginDef<I extends readonly AnyServiceToken[] = readonly []> {
  /** Non-empty name used in diagnostics and contribution ownership. */
  readonly name: string
  /** Tokens this plugin may `provide`. Anything else is a setup error. */
  readonly provides?: readonly AnyServiceToken[]
  /**
   * The load-bearing declaration. The plugin activates only when every
   * token here is present, and is disposed when any of them goes away.
   */
  readonly inject?: I
  /**
   * Activate the plugin with a fresh lifetime scope.
   * Check `scope.active` after every `await` before publishing effects (spec §6.8).
   *
   * @example
   * ```ts
   * setup(scope) {
   *   const resource = { close() {} }
   *   scope.defer(() => resource.close())
   * }
   * ```
   */
  setup(scope: Scope<I>): void | Promise<void>
}

declare const PLUGIN: unique symbol

/** A validated plugin definition whose object identity is its runtime identity. */
export interface Plugin<I extends readonly AnyServiceToken[] = readonly []> extends PluginDef<I> {
  /** Compile-time brand; absent at runtime. */
  readonly [PLUGIN]?: true
}

/** Any plugin regardless of its injected token tuple. */
export type AnyPlugin = Plugin<readonly AnyServiceToken[]>

/** Reversible effects and capability access for one plugin activation. */
export interface Scope<I extends readonly AnyServiceToken[] = readonly AnyServiceToken[]> {
  /** Plugin name; useful in logs. */
  readonly name: string
  /** False once disposal has begun. Check this after any `await` in `setup`. */
  readonly active: boolean

  /**
   * Register a reversible effect. Disposers run LIFO when the scope
   * disposes (spec §8.2). Calling `defer` on a disposed scope runs `fn`
   * immediately (spec §6.2).
   *
   * @example
   * ```ts
   * import { definePlugin } from '@yatoi/kernel'
   * definePlugin({ name: 'resource', setup(scope) {
   *   const resource = { close() {} }
   *   scope.defer(() => resource.close())
   * } })
   * ```
   */
  defer(fn: Disposer): void

  /**
   * Publish a service. The token must be listed in `provides`. Removal is
   * deferred automatically. Throws if another plugin already provides it.
   *
   * @example
   * ```ts
   * import { definePlugin } from '@yatoi/kernel'
   * import { Clock } from './contract.js'
   * definePlugin({ name: 'clock', provides: [Clock], setup(scope) {
   *   scope.provide(Clock, { now: () => Date.now() })
   * } })
   * ```
   */
  provide<T>(token: ServiceToken<T>, value: T): void

  /** Typed non-null for injected tokens — the graph guarantees presence. */
  get<Tok extends I[number]>(token: Tok): ServiceType<Tok>
  /** Anything not injected may be absent. */
  get<T>(token: ServiceToken<T>): T | undefined

  /**
   * Add to a collection. Removal is deferred automatically.
   *
   * @example
   * ```ts
   * import { definePlugin } from '@yatoi/kernel'
   * import { Commands } from './contract.js'
   * definePlugin({ name: 'commands', setup(scope) {
   *   scope.contribute(Commands, { name: 'sync', run() {} })
   * } })
   * ```
   */
  contribute<T>(collection: CollectionToken<T>, value: T, meta?: ContributionMeta): void

  /**
   * Load a child plugin. It unloads before this scope's own disposers (spec §6.7).
   *
   * @example
   * ```ts
   * import { definePlugin } from '@yatoi/kernel'
   * import { sessionPlugin } from './session.js'
   * definePlugin({ name: 'delegation', setup(scope) {
   *   scope.load(sessionPlugin)
   * } })
   * ```
   */
  load(plugin: AnyPlugin): PluginHandle
}

/** Live handle for one plugin registration. */
export interface PluginHandle {
  /** Plugin object registered by this handle. */
  readonly plugin: AnyPlugin
  /** Current lifecycle state. */
  readonly state: PluginState
  /** Set when `state === 'failed'`. */
  readonly error: unknown
  /** Unload this registration; child handles dispose only their child. */
  dispose(): void
}

/** Receives a contained setup or disposer error and its owning plugin. */
export type KernelErrorListener = (error: unknown, plugin: AnyPlugin) => void

/** Synchronous capability graph and plugin lifecycle controller. */
export interface Kernel {
  /**
   * Register plugins. Registration is synchronous; activation is derived
   * from dependency presence and may happen immediately or later.
   * Throws if a plugin is already loaded at the top level.
   * Never call this during UI render; mutate in bootstrap, an event handler,
   * or a framework effect (spec §13.2).
   *
   * @example
   * ```ts
   * import { createKernel } from '@yatoi/kernel'
   * import { clockPlugin } from './clock-plugin.js'
   * const kernel = createKernel()
   * const [clockHandle] = kernel.load(clockPlugin)
   * ```
   */
  load(...plugins: AnyPlugin[]): PluginHandle[]
  /**
   * Unregister a top-level plugin. Its scope disposes synchronously (async
   * disposers are tracked, not awaited). Dependents cascade. No-op if the
   * plugin is not loaded — safe to call from a React effect cleanup.
   * Never call this during UI render; mutate between render/request/turn boundaries.
   *
   * @example
   * ```ts
   * import { createKernel } from '@yatoi/kernel'
   * import { clockPlugin } from './clock-plugin.js'
   * const kernel = createKernel()
   * kernel.load(clockPlugin)
   * kernel.unload(clockPlugin)
   * ```
   */
  unload(plugin: AnyPlugin): void

  /** Return the current service value, or `undefined` when absent. */
  get<T>(token: ServiceToken<T>): T | undefined
  /**
   * Return the synchronous `present | loading | absent` snapshot (spec §9.4).
   *
   * @example
   * ```ts
   * import { createKernel } from '@yatoi/kernel'
   * import { Clock } from './contract.js'
   * const kernel = createKernel()
   * const state = kernel.state(Clock)
   * if (state.status === 'present') state.value.now()
   * ```
   */
  state<T>(token: ServiceToken<T>): ServiceState<T>
  /** Priority-sorted. Same array reference until the collection changes. */
  list<T>(collection: CollectionToken<T>): readonly Contribution<T>[]
  /** Return the most recent lifecycle state for a plugin object. */
  pluginState(plugin: AnyPlugin): PluginState

  /**
   * Subscribe to synchronous, once-per-mutation notifications (spec §9.5).
   *
   * @example
   * ```ts
   * import { createKernel } from '@yatoi/kernel'
   * const kernel = createKernel()
   * const unsubscribe = kernel.subscribe(() => console.log(kernel.version))
   * unsubscribe()
   * ```
   */
  subscribe(listener: () => void): () => void
  /** Monotonic observable-state version used by bindings. */
  readonly version: number

  /** Errors from `setup` and disposers. Without a listener they go to `console.error`. */
  on(event: 'error', listener: KernelErrorListener): () => void

  /** Resolves when no setup or disposal is in flight. Primarily for tests. */
  settle(): Promise<void>
  /** Unload everything and wait for disposal. */
  dispose(): Promise<void>
}
