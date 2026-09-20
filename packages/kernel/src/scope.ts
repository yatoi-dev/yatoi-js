import type { AnyServiceToken, CollectionToken, ServiceToken, ServiceType } from './token.js'
import type { Registry } from './registry.js'
import type {
  AnyPlugin,
  ContributionMeta,
  Disposer,
  PluginHandle,
  Scope,
} from './types.js'

/** What a scope needs from the kernel, kept narrow so `scope.ts` stays legible. */
export interface ScopeHost {
  readonly registry: Registry
  loadChild(parent: ScopeImpl, plugin: AnyPlugin): PluginHandle
  /** Stop and unregister every plugin loaded via `parent.load`. Returns in-flight disposals. */
  disposeChildren(parent: ScopeImpl): Promise<void>[]
  reportError(error: unknown, plugin: AnyPlugin): void
}

export class ScopeImpl implements Scope<readonly AnyServiceToken[]> {
  readonly name: string
  active = true

  private readonly disposers: Disposer[] = []
  private readonly provides: ReadonlySet<string>
  /** Injected values snapshotted at activation — stable for the scope's lifetime. */
  private readonly injected = new Map<string, unknown>()
  /** Tokens this scope has actually provided; the kernel cascades on these. */
  readonly provided = new Set<AnyServiceToken>()

  constructor(
    private readonly host: ScopeHost,
    readonly plugin: AnyPlugin,
  ) {
    this.name = plugin.name
    this.provides = new Set((plugin.provides ?? []).map((t) => t.key))
    for (const token of plugin.inject ?? []) {
      this.injected.set(token.key, host.registry.getService(token))
    }
  }

  defer(fn: Disposer): void {
    if (!this.active) {
      this.run(fn)
      return
    }
    this.disposers.push(fn)
  }

  provide<T>(token: ServiceToken<T>, value: T): void {
    if (!this.active) {
      console.warn(`[yatoi] ${this.name}: provide(${token.key}) after scope disposed — ignored`)
      return
    }
    if (!this.provides.has(token.key)) {
      throw new Error(
        `[yatoi] ${this.name}: provide(${token.key}) but "${token.key}" is not in this plugin's \`provides\``,
      )
    }
    const registry = this.host.registry
    const holder = registry.serviceOwner(token)
    if (holder !== undefined) {
      throw new Error(`[yatoi] ${this.name}: "${token.key}" is already provided by "${holder}"`)
    }
    this.provided.add(token)
    registry.setService(token, value, this.name)
    this.disposers.push(() => registry.deleteService(token, this.name))
  }

  get<Tok extends AnyServiceToken>(token: Tok): ServiceType<Tok>
  get<T>(token: ServiceToken<T>): T | undefined
  get(token: AnyServiceToken): unknown {
    if (this.injected.has(token.key)) return this.injected.get(token.key)
    return this.host.registry.getService(token)
  }

  contribute<T>(collection: CollectionToken<T>, value: T, meta?: ContributionMeta): void {
    if (!this.active) {
      console.warn(`[yatoi] ${this.name}: contribute(${collection.key}) after scope disposed — ignored`)
      return
    }
    this.disposers.push(this.host.registry.addContribution(collection, value, meta, this.name))
  }

  load(plugin: AnyPlugin): PluginHandle {
    if (!this.active) {
      throw new Error(`[yatoi] ${this.name}: load(${plugin.name}) after scope disposed`)
    }
    return this.host.loadChild(this, plugin)
  }

  /**
   * Tear down: children first, then own disposers LIFO. Everything is
   * *invoked* synchronously; returned promises are collected so the kernel
   * can gate a reload on them without ever exposing them to observers.
   */
  dispose(): Promise<void>[] {
    if (!this.active) return []
    this.active = false
    const pending = this.host.disposeChildren(this)
    while (this.disposers.length) {
      const p = this.run(this.disposers.pop()!)
      if (p) pending.push(p)
    }
    return pending
  }

  private run(fn: Disposer): Promise<void> | null {
    try {
      const result = fn()
      if (result && typeof (result as Promise<void>).then === 'function') {
        return (result as Promise<void>).then(undefined, (e) => this.host.reportError(e, this.plugin))
      }
    } catch (e) {
      this.host.reportError(e, this.plugin)
    }
    return null
  }
}
