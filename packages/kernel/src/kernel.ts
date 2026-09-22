import { Registry } from './registry.js'
import { ScopeImpl, type ScopeHost } from './scope.js'
import { reportedError, ruleError } from './errors.js'
import type { CollectionToken, ServiceToken } from './token.js'
import type {
  AnyPlugin,
  Contribution,
  Kernel,
  KernelErrorListener,
  PluginHandle,
  PluginState,
  ServiceState,
} from './types.js'

/**
 * One registration of a plugin. The same plugin may have several records
 * over time (load → unload → load); at most one is `registered` per parent.
 * Unregistered records linger only while their disposal is in flight.
 */
interface PluginRecord {
  readonly plugin: AnyPlugin
  /** Scope that loaded this plugin, or null for kernel-level. */
  readonly parent: ScopeImpl | null
  registered: boolean
  state: PluginState
  /** Live while `starting` or `active`; null otherwise. */
  scope: ScopeImpl | null
  error: unknown
  handle: PluginHandle
}

const ABSENT: ServiceState<never> = Object.freeze({ status: 'absent' })
const LOADING: ServiceState<never> = Object.freeze({ status: 'loading' })

/** Guard against a plugin graph that never converges (should be impossible; fail loudly if not). */
const MAX_PASSES = 10_000

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}

export function createKernel(): Kernel {
  return new KernelImpl()
}

class KernelImpl implements Kernel, ScopeHost {
  readonly registry = new Registry(() => this.schedule())

  private readonly records: PluginRecord[] = []
  private readonly errorListeners = new Set<KernelErrorListener>()
  /** Every setup and disposal promise currently in flight. `settle()` drains it. */
  private readonly inflight = new Set<Promise<unknown>>()
  private inMutation = false
  private needsPass = false

  // ── observation ─────────────────────────────────────────────────────

  get version(): number {
    return this.registry.version
  }

  // Arrow so it can be passed straight to `useSyncExternalStore`.
  subscribe = (listener: () => void): (() => void) => this.registry.subscribe(listener)

  get<T>(token: ServiceToken<T>): T | undefined {
    return this.registry.getService(token)
  }

  state<T>(token: ServiceToken<T>): ServiceState<T> {
    if (this.registry.hasService(token)) {
      return { status: 'present', value: this.registry.getService(token) as T }
    }
    // A registered provider that is mid-setup, or mid-teardown *and will
    // restart*, reads as loading. Providers blocked on their own deps are
    // absent — "loading" must mean progress is actually being made. A
    // `disposing` record carrying a failure (§7.3) will settle to sticky
    // `failed`, not restart, so it reads absent too — unless a dependency
    // cycle already cleared that failure (`rec.error === undefined`),
    // in which case it will settle to `inactive` and retry.
    for (const rec of this.records) {
      if (!rec.registered) continue
      const willRestart = rec.state === 'starting' || (rec.state === 'disposing' && rec.error === undefined)
      if (!willRestart) continue
      if (rec.plugin.provides?.some((t) => t.key === token.key)) return LOADING
    }
    return ABSENT
  }

  list<T>(collection: CollectionToken<T>): readonly Contribution<T>[] {
    return this.registry.list(collection)
  }

  pluginState(plugin: AnyPlugin): PluginState {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i]!
      if (rec.plugin === plugin) return rec.state
    }
    return 'inactive'
  }

  on(_event: 'error', listener: KernelErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => {
      this.errorListeners.delete(listener)
    }
  }

  // ── mutation ────────────────────────────────────────────────────────

  load(...plugins: AnyPlugin[]): PluginHandle[] {
    return this.mutate(() => plugins.map((p) => this.register(p, null)))
  }

  unload(plugin: AnyPlugin): void {
    const rec = this.records.find((r) => r.registered && r.parent === null && r.plugin === plugin)
    if (!rec) return
    this.mutate(() => {
      this.unregister(rec)
    })
  }

  async settle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.all([...this.inflight])
  }

  async dispose(): Promise<void> {
    this.mutate(() => {
      for (const rec of [...this.records]) {
        if (rec.registered && rec.parent === null) this.unregister(rec)
      }
    })
    await this.settle()
  }

  // ── ScopeHost ───────────────────────────────────────────────────────

  loadChild(parent: ScopeImpl, plugin: AnyPlugin): PluginHandle {
    return this.mutate(() => this.register(plugin, parent))
  }

  disposeChildren(parent: ScopeImpl): Promise<void>[] {
    const pending: Promise<void>[] = []
    for (const rec of [...this.records]) {
      if (rec.registered && rec.parent === parent) pending.push(...this.unregister(rec))
    }
    return pending
  }

  reportError(error: unknown, plugin: AnyPlugin): void {
    if (this.errorListeners.size === 0) {
      console.error(error)
      return
    }
    for (const listener of [...this.errorListeners]) {
      try {
        listener(error, plugin)
      } catch (listenerError) {
        // A listener MUST NOT be able to take down the kernel or hide the
        // original error from the other listeners (spec §10.6).
        console.error(
          reportedError(
            'Error listener failed',
            plugin.name,
            listenerError,
            'Change the error listener so it does not throw',
            '10.6',
          ),
        )
      }
    }
  }

  // ── reconciliation ──────────────────────────────────────────────────

  /**
   * Every mutation goes through here. Nested calls just run `fn` and flag a
   * pass; the outermost call loops passes to a fixed point, prunes dead
   * records, and flushes exactly one notification.
   */
  private mutate<R>(fn: () => R): R {
    if (this.inMutation) {
      const result = fn()
      this.needsPass = true
      return result
    }
    this.inMutation = true
    try {
      return this.registry.batch(() => {
        const result = fn()
        this.needsPass = true
        let passes = 0
        while (this.needsPass) {
          if (++passes > MAX_PASSES) {
            throw ruleError(
              'Plugin graph did not converge',
              '<kernel>',
              'a setup kept mutating the graph without reaching a fixed point',
              'Stop loading plugins or publishing capabilities in a repeating setup loop',
              '12.2',
            )
          }
          this.needsPass = false
          this.pass()
        }
        this.prune()
        return result
      })
    } finally {
      this.inMutation = false
    }
  }

  /** Registry change hook. Inside a mutation it just flags; outside it runs one. */
  private schedule(): void {
    this.needsPass = true
    if (!this.inMutation) this.mutate(() => {})
  }

  private pass(): void {
    for (const rec of [...this.records]) {
      if (!rec.registered) continue
      const ready = this.depsPresent(rec)
      switch (rec.state) {
        case 'inactive':
          if (ready) this.start(rec)
          break
        case 'starting':
        case 'active':
          if (!ready) this.stop(rec)
          break
        case 'failed':
          // A dependency went away; forget the failure so the plugin retries when it returns.
          if (!ready) {
            rec.state = 'inactive'
            rec.error = undefined
            this.registry.touch()
          }
          break
        case 'disposing':
          // Restarts (if still wanted) when the disposal promise settles.
          // §7.3: if this scope is disposing because its `setup` failed
          // (rec.error set) and a dependency goes absent while cleanup is
          // still in flight, the failure clears right here — same rule as
          // the `failed` branch below — so the record settles to
          // `inactive` (not `failed`) once disposal finishes, and restarts
          // as soon as deps are present again.
          if (rec.error !== undefined && !ready) {
            rec.error = undefined
            this.registry.touch()
          }
          break
      }
    }
  }

  private prune(): void {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i]!
      if (!rec.registered && rec.state !== 'disposing') this.records.splice(i, 1)
    }
  }

  private depsPresent(rec: PluginRecord): boolean {
    const inject = rec.plugin.inject
    if (!inject) return true
    for (const token of inject) if (!this.registry.hasService(token)) return false
    return true
  }

  // ── plugin lifecycle ────────────────────────────────────────────────

  private register(plugin: AnyPlugin, parent: ScopeImpl | null): PluginHandle {
    if (this.records.some((r) => r.registered && r.parent === parent && r.plugin === plugin)) {
      throw ruleError(
        'Plugin was loaded twice',
        plugin.name,
        parent
          ? `the same plugin object is already registered under parent plugin "${parent.name}"`
          : 'the same plugin object is already registered at the kernel top level',
        'Unload that plugin object before loading it again',
        '5.4',
      )
    }
    const rec: PluginRecord = {
      plugin,
      parent,
      registered: true,
      state: 'inactive',
      scope: null,
      error: undefined,
      handle: undefined as unknown as PluginHandle,
    }
    rec.handle = {
      plugin,
      get state() {
        return rec.state
      },
      get error() {
        return rec.error
      },
      dispose: () => {
        if (!rec.registered) return
        this.mutate(() => {
          this.unregister(rec)
        })
      },
    }
    this.records.push(rec)
    this.registry.touch()
    return rec.handle
  }

  /** Marks unregistered and stops if running. Returns in-flight disposals. */
  private unregister(rec: PluginRecord): Promise<void>[] {
    rec.registered = false
    this.registry.touch()
    return this.stop(rec)
  }

  private start(rec: PluginRecord): void {
    const scope = new ScopeImpl(this, rec.plugin)
    rec.scope = scope
    rec.state = 'starting'
    rec.error = undefined
    this.registry.touch()

    let result: unknown
    try {
      result = rec.plugin.setup(scope)
    } catch (e) {
      this.fail(rec, scope, e)
      return
    }

    if (!isThenable(result)) {
      rec.state = 'active'
      this.registry.touch()
      return
    }

    // Async setup. The scope may be disposed before this resolves (e.g. a
    // dependency vanished mid-await); then the outcome is simply ignored —
    // `scope.active` is false and provide/contribute are already no-ops.
    const stale = () => rec.scope !== scope || !scope.active
    this.track(
      Promise.resolve(result).then(
        () => {
          if (stale()) return
          this.mutate(() => {
            rec.state = 'active'
            this.registry.touch()
          })
        },
        (e: unknown) => {
          if (stale()) return
          this.mutate(() => this.fail(rec, scope, e))
        },
      ),
    )
  }

  private stop(rec: PluginRecord): Promise<void>[] {
    if (rec.state !== 'active' && rec.state !== 'starting') return []
    const scope = rec.scope!
    rec.state = 'disposing'
    rec.scope = null

    // Cascade: dependents dispose before their provider, so a dependent's
    // cleanup can still reach the service it depended on. Their own async
    // disposals are tracked on their own records.
    for (const token of scope.provided) {
      for (const dep of this.records) {
        if (dep === rec || !dep.registered) continue
        if (dep.state !== 'active' && dep.state !== 'starting') continue
        if (dep.plugin.inject?.some((t) => t.key === token.key)) this.stop(dep)
      }
    }

    const pending = scope.dispose()
    if (pending.length === 0) {
      rec.state = 'inactive'
    } else {
      this.track(
        Promise.all(pending).then(() => {
          this.mutate(() => {
            rec.state = 'inactive'
            this.registry.touch()
          })
        }),
      )
    }
    this.registry.touch()
    this.needsPass = true
    return pending
  }

  private fail(rec: PluginRecord, scope: ScopeImpl, error: unknown): void {
    const reported = reportedError(
      'Setup failed',
      rec.plugin.name,
      error,
      'Change `setup` so it completes without throwing or rejecting',
      '10.1',
    )
    rec.error = reported
    rec.scope = null
    // Whatever the partial setup registered still unwinds — it must not
    // leak — and it happens *before* reporting (§10.1), so nothing a
    // reporter does can observe or leave the partial scope live.
    const pending = scope.dispose()
    for (const p of pending) this.track(p)
    if (pending.length === 0) {
      rec.state = 'failed'
    } else {
      // §7.3: cleanup is still in flight. Stay `disposing` (with `error`
      // already set) so §7.1's restart gate blocks a new scope from
      // overlapping this one's still-running disposers. Only settle into
      // `failed` once every disposer awaitable has resolved.
      rec.state = 'disposing'
      Promise.all(pending).then(() => {
        this.mutate(() => {
          // §7.3: a dependency going absent while `disposing` (handled in
          // `pass()`) already cleared `rec.error` if it happened. Settle
          // to `inactive` in that case — the pass this `mutate()` runs
          // will start it immediately if deps are present again — or to
          // `failed` if the failure was never cleared (sticky, §7.2).
          rec.state = rec.error === undefined ? 'inactive' : 'failed'
          this.registry.touch()
        })
      })
    }
    this.reportError(reported, rec.plugin)
    this.registry.touch()
    this.needsPass = true
  }

  private track(p: Promise<unknown>): void {
    this.inflight.add(p)
    const done = () => {
      this.inflight.delete(p)
    }
    p.then(done, done)
  }
}
