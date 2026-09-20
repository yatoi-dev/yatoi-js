import type { AnyServiceToken, CollectionToken, ServiceToken } from './token.js'
import type { Contribution, ContributionMeta } from './types.js'

interface ServiceEntry {
  readonly token: AnyServiceToken
  readonly value: unknown
  readonly owner: string
}

interface CollectionEntry {
  readonly items: Contribution<unknown>[]
  /** Cached sorted view; null when stale. Referential stability matters for React. */
  sorted: readonly Contribution<unknown>[] | null
}

const EMPTY: readonly Contribution<never>[] = Object.freeze([])

/**
 * The value store plus the single change channel. Every mutation bumps
 * `version`; listeners fire once per outermost `batch`, synchronously,
 * after the batch completes. Value mutations also call `onChange` so the
 * kernel can reconcile the plugin graph. Nothing here knows about plugins.
 */
export class Registry {
  version = 0

  private readonly services = new Map<string, ServiceEntry>()
  private readonly collections = new Map<string, CollectionEntry>()
  private readonly listeners = new Set<() => void>()
  private depth = 0
  private dirty = false

  constructor(private readonly onChange: () => void) {}

  batch<R>(fn: () => R): R {
    this.depth++
    try {
      return fn()
    } finally {
      this.depth--
      if (this.depth === 0) this.flush()
    }
  }

  /**
   * Record a change. Only marks dirty — the flush happens when the outermost
   * `batch` ends, so the kernel controls notification granularity. Every
   * caller of `touch` is inside a kernel mutation.
   */
  touch(): void {
    this.version++
    this.dirty = true
  }

  private flush(): void {
    if (!this.dirty) return
    this.dirty = false
    for (const listener of [...this.listeners]) listener()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // ── services ────────────────────────────────────────────────────────

  hasService(token: AnyServiceToken): boolean {
    return this.services.has(token.key)
  }

  getService<T>(token: ServiceToken<T>): T | undefined {
    return this.services.get(token.key)?.value as T | undefined
  }

  serviceOwner(token: AnyServiceToken): string | undefined {
    return this.services.get(token.key)?.owner
  }

  setService<T>(token: ServiceToken<T>, value: T, owner: string): void {
    this.services.set(token.key, { token, value, owner })
    this.touch()
    this.onChange()
  }

  /** Removes only if `owner` still holds it — a stale disposer must not evict a newer provider. */
  deleteService(token: AnyServiceToken, owner: string): void {
    const entry = this.services.get(token.key)
    if (!entry || entry.owner !== owner) return
    this.services.delete(token.key)
    this.touch()
    this.onChange()
  }

  // ── collections ─────────────────────────────────────────────────────

  addContribution<T>(
    collection: CollectionToken<T>,
    value: T,
    meta: ContributionMeta | undefined,
    owner: string,
  ): () => void {
    let entry = this.collections.get(collection.key)
    if (!entry) {
      entry = { items: [], sorted: null }
      this.collections.set(collection.key, entry)
    }
    const item: Contribution<unknown> = {
      value,
      priority: meta?.priority ?? 0,
      mode: meta?.mode ?? 'append',
      owner,
    }
    entry.items.push(item)
    entry.sorted = null
    this.touch()
    this.onChange()
    const target = entry
    return () => {
      const i = target.items.indexOf(item)
      if (i === -1) return
      target.items.splice(i, 1)
      target.sorted = null
      this.touch()
      this.onChange()
    }
  }

  list<T>(collection: CollectionToken<T>): readonly Contribution<T>[] {
    const entry = this.collections.get(collection.key)
    if (!entry || entry.items.length === 0) return EMPTY
    if (!entry.sorted) {
      // Stable sort: higher priority first, insertion order within a tier.
      entry.sorted = Object.freeze([...entry.items].sort((a, b) => b.priority - a.priority))
    }
    return entry.sorted as readonly Contribution<T>[]
  }
}
