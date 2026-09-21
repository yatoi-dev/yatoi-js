import { shallowRef, type ShallowRef } from 'vue'
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
// first mount) and the Marketplace component (which reads after) await the
// same in-flight request instead of each firing their own.
export const manifestPromise: Promise<MarketplaceEntry[]> = fetchManifest()

/**
 * No chapter 2 seam here (no `VITE_PLUGIN_BASE`) — see the top-level task
 * brief: this example only ports chapter 1. Every id resolves through the
 * bundled registry or not at all.
 */
export function isAvailable(id: string): boolean {
  return id in registry
}

async function activate(id: string): Promise<AnyPlugin> {
  const load = registry[id]
  if (!load) throw new Error(`no code registered for plugin "${id}"`)
  const mod: unknown = await load()
  const candidate = (mod as { default?: unknown } | null)?.default
  if (!isPluginLike(candidate)) {
    throw new Error(`plugin "${id}" has no valid default export (expected a plugin with name + setup)`)
  }
  return candidate
}

export interface MarketplaceState {
  readonly manifest: readonly MarketplaceEntry[] | null
  readonly installed: ReadonlySet<string>
  // Loaded plugin *objects*, keyed by manifest id — the kernel identifies a
  // plugin by object identity, so this is what lets `uninstall` find the
  // exact instance `install` loaded.
  readonly loaded: ReadonlyMap<string, AnyPlugin>
  readonly errors: ReadonlyMap<string, string>
}

// A single module-scope store, mirroring the React example's — Vue's own
// composable is thinner (a `shallowRef` snapshot instead of
// `useSyncExternalStore`) but the state-shape and the install/uninstall/
// restore functions are identical in spirit.
const state = shallowRef<MarketplaceState>({
  manifest: null,
  installed: loadInstalled(),
  loaded: new Map(),
  errors: new Map(),
})

function set(patch: Partial<MarketplaceState>): void {
  state.value = { ...state.value, ...patch }
}

/** A read-only ref snapshot of marketplace state — the Vue equivalent of the React `useMarketplace()` hook. */
export function useMarketplace(): Readonly<ShallowRef<MarketplaceState>> {
  return state
}

void manifestPromise.then((data) => set({ manifest: data }))

/**
 * Event-handler-shaped: called from a button's `@click`, never from
 * render. `kernel.load` only ever runs here or in `restoreInstalled`
 * (bootstrap), both outside Vue's render phase.
 */
export async function installPlugin(entry: MarketplaceEntry): Promise<void> {
  const { id } = entry
  // Guard on `loaded`, not `installed`: a previously-installed plugin whose
  // restore failed is still in `installed` but never made it into
  // `loaded`, and its card's button must be able to retry.
  if (state.value.loaded.has(id) || !isAvailable(id)) return
  try {
    const plugin = await activate(id)
    kernel.load(plugin)
    const errors = new Map(state.value.errors)
    errors.delete(id)
    const installed = new Set(state.value.installed).add(id)
    saveInstalled(installed)
    set({ loaded: new Map(state.value.loaded).set(id, plugin), errors, installed })
  } catch (err) {
    set({ errors: new Map(state.value.errors).set(id, err instanceof Error ? err.message : String(err)) })
  }
}

/**
 * Also doubles as "remove" for a plugin that's `installed` but never
 * `loaded` (a failed restore): there's no kernel object to unload, so this
 * just clears the id from persisted state and its error.
 */
export function uninstallPlugin(id: string): void {
  const plugin = state.value.loaded.get(id)
  if (plugin) kernel.unload(plugin)
  const loaded = new Map(state.value.loaded)
  loaded.delete(id)
  const errors = new Map(state.value.errors)
  errors.delete(id)
  const installed = new Set(state.value.installed)
  installed.delete(id)
  saveInstalled(installed)
  set({ loaded, errors, installed })
}

/**
 * Re-activates whatever was installed last session. Called once from
 * `bootstrap.ts`, before Vue mounts. A failed activation records an
 * error and leaves the id in `installed` — the card shows "Failed to
 * load" with Retry and Remove, rather than silently forgetting the
 * install.
 */
export async function restoreInstalled(): Promise<void> {
  const loaded = new Map(state.value.loaded)
  const errors = new Map(state.value.errors)
  await Promise.all(
    [...state.value.installed].map(async (id) => {
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
