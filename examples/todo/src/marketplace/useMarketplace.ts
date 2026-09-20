import { useSyncExternalStore } from 'react'
import type { AnyPlugin } from '@yatoi/kernel'
import { kernel } from '../kernel.js'
import { registry } from '../plugins/registry.js'
import { loadInstalled, saveInstalled } from './installed.js'

export interface MarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
}

function isPluginLike(value: unknown): value is AnyPlugin {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string' &&
    'setup' in value &&
    typeof (value as { setup: unknown }).setup === 'function'
  )
}

async function fetchManifest(): Promise<MarketplaceEntry[]> {
  try {
    const res = await fetch('/plugins.json')
    return (await res.json()) as MarketplaceEntry[]
  } catch {
    return []
  }
}

// Fetched once, at module scope, so `bootstrap()` (which runs before the
// first render) and the Marketplace component (which runs after) await the
// same in-flight request instead of each firing their own.
export const manifestPromise: Promise<MarketplaceEntry[]> = fetchManifest()

// Where a plugin's code comes from is deployment configuration, not app
// logic. Default: bundled with the app, via registry.ts. With
// VITE_PLUGIN_BASE set (chapter 2 of the README), the same ids resolve to
// separately built files on another origin instead.
const PLUGIN_BASE = import.meta.env.VITE_PLUGIN_BASE as string | undefined
const REMOTE = Boolean(PLUGIN_BASE)

// Ids whose last remote-mode load attempt failed — see `remoteUrl` below.
// Irrelevant in local mode: a registry `import()` either exists at build
// time or doesn't, and retrying it never changes the answer.
const failedIds = new Set<string>()

function remoteUrl(id: string): string {
  const url = `${PLUGIN_BASE}/${id}.js`
  // `import()` caches its result — success *or failure* — per exact URL,
  // for the life of the page, so retrying a failed load with the same URL
  // would just replay the cached rejection instead of re-fetching. Only
  // bust the cache when the *previous* attempt for this id failed; a first
  // attempt (or a successful one) uses the clean URL, so normal HTTP/CDN
  // caching still applies — this is meant to model loading from a CDN.
  return failedIds.has(id) ? `${url}?_retry=${Date.now()}` : url
}

/** In local mode, an id not in the registry can never be installed. */
export function isAvailable(id: string): boolean {
  return REMOTE || id in registry
}

function loaderFor(id: string): (() => Promise<unknown>) | undefined {
  if (REMOTE) return () => import(/* @vite-ignore */ remoteUrl(id))
  return registry[id]
}

async function activate(id: string): Promise<AnyPlugin> {
  const load = loaderFor(id)
  if (!load) throw new Error(`no code registered for plugin "${id}"`)
  try {
    const mod: unknown = await load()
    const candidate = (mod as { default?: unknown } | null)?.default
    if (!isPluginLike(candidate)) {
      throw new Error(`plugin "${id}" has no valid default export (expected a plugin with name + setup)`)
    }
    failedIds.delete(id)
    return candidate
  } catch (err) {
    failedIds.add(id)
    throw err
  }
}

interface MarketplaceState {
  readonly manifest: readonly MarketplaceEntry[] | null
  readonly installed: ReadonlySet<string>
  // Loaded plugin *objects*, keyed by manifest id — the kernel identifies a
  // plugin by object identity, so this is what lets `uninstall` find the
  // exact instance `install` loaded.
  readonly loaded: ReadonlyMap<string, AnyPlugin>
  readonly errors: ReadonlyMap<string, string>
}

let state: MarketplaceState = {
  manifest: null,
  installed: loadInstalled(),
  loaded: new Map(),
  errors: new Map(),
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function set(patch: Partial<MarketplaceState>): void {
  state = { ...state, ...patch }
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMarketplace(): MarketplaceState {
  return useSyncExternalStore(subscribe, () => state)
}

void manifestPromise.then((data) => set({ manifest: data }))

/**
 * Event-handler-shaped: called from a button's `onClick`, never from
 * render. `kernel.load` only ever runs here or in `restoreInstalled`
 * (bootstrap), both outside React's render phase.
 */
export async function installPlugin(entry: MarketplaceEntry): Promise<void> {
  const { id } = entry
  // Guard on `loaded`, not `installed`: a previously-installed plugin whose
  // restore failed is still in `installed` but never made it into
  // `loaded`, and its card's button must be able to retry.
  if (state.loaded.has(id) || !isAvailable(id)) return
  try {
    const plugin = await activate(id)
    kernel.load(plugin)
    const errors = new Map(state.errors)
    errors.delete(id)
    const installed = new Set(state.installed).add(id)
    saveInstalled(installed)
    set({ loaded: new Map(state.loaded).set(id, plugin), errors, installed })
  } catch (err) {
    set({ errors: new Map(state.errors).set(id, err instanceof Error ? err.message : String(err)) })
  }
}

/**
 * Also doubles as "remove" for a plugin that's `installed` but never
 * `loaded` (a failed restore): there's no kernel object to unload, so this
 * just clears the id from persisted state and its error.
 *
 * Deliberately does NOT clear `failedIds`. The browser's module map has
 * already cached the clean URL as failed for the life of this page — that
 * cache is keyed by the exact URL string and outlives "uninstall" (it's
 * not ours to clear), so a later install attempt for this id must keep
 * busting or it will silently replay the old failure with no network
 * request at all. Only a full page reload actually clears it.
 */
export function uninstallPlugin(id: string): void {
  const plugin = state.loaded.get(id)
  if (plugin) kernel.unload(plugin)
  const loaded = new Map(state.loaded)
  loaded.delete(id)
  const errors = new Map(state.errors)
  errors.delete(id)
  const installed = new Set(state.installed)
  installed.delete(id)
  saveInstalled(installed)
  set({ loaded, errors, installed })
}

/**
 * Re-activates whatever was installed last session. Called once from
 * `bootstrap.ts`, before React renders. A failed activation records an
 * error and leaves the id in `installed` — the card shows "Failed to
 * load" with Retry and Remove, rather than silently forgetting the
 * install.
 */
export async function restoreInstalled(): Promise<void> {
  const loaded = new Map(state.loaded)
  const errors = new Map(state.errors)
  await Promise.all(
    [...state.installed].map(async (id) => {
      if (!isAvailable(id)) return
      try {
        const plugin = await activate(id)
        kernel.load(plugin)
        loaded.set(id, plugin)
        errors.delete(id)
      } catch (err) {
        errors.set(id, err instanceof Error ? err.message : String(err))
      }
    }),
  )
  set({ loaded, errors })
}
