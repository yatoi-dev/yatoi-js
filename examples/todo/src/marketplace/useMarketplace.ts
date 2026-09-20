import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AnyPlugin } from '@weft/kernel'
import { kernel } from '../kernel.js'
import { pluginModules } from '../plugins/registry.js'
import { loadInstalled, saveInstalled } from './installed.js'

export interface MarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
}

// Loaded plugin *objects*, keyed by manifest id — the kernel identifies a
// plugin by object identity, so this is what makes `uninstall` able to find
// the exact instance `install` loaded (and stops a second install of the
// same id from calling `kernel.load` twice, which throws).
const loaded = new Map<string, AnyPlugin>()
let installedIds = loadInstalled()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribeInstalled(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isAvailable(id: string): boolean {
  return id in pluginModules
}

/** The loaded plugin object for an installed id, for `kernel.pluginState()`. */
export function getLoadedPlugin(id: string): AnyPlugin | undefined {
  return loaded.get(id)
}

/**
 * Event-handler-shaped: called from a button's `onClick`, never from
 * render. `kernel.load` only ever runs here or in `restoreInstalled`
 * (bootstrap), both outside React's render phase.
 */
export async function installPlugin(id: string): Promise<void> {
  if (installedIds.has(id)) return
  const loader = pluginModules[id]
  if (!loader) return // manifest-only entry (e.g. "tags") — nothing to activate
  const mod = await loader()
  kernel.load(mod.default)
  loaded.set(id, mod.default)
  installedIds = new Set(installedIds).add(id)
  saveInstalled(installedIds)
  notify()
}

export function uninstallPlugin(id: string): void {
  const plugin = loaded.get(id)
  if (plugin) {
    kernel.unload(plugin)
    loaded.delete(id)
  }
  if (!installedIds.has(id)) return
  const next = new Set(installedIds)
  next.delete(id)
  installedIds = next
  saveInstalled(installedIds)
  notify()
}

/**
 * Re-activates whatever was installed last session. Called once from
 * `bootstrap.ts`, before React renders — the due dates a reinstalled
 * calendar sees were never deleted, because uninstalling only ever
 * unloaded the plugin, not the data it wrote.
 */
export async function restoreInstalled(): Promise<void> {
  await Promise.all(
    [...installedIds].map(async (id) => {
      const loader = pluginModules[id]
      if (!loader) return
      const mod = await loader()
      kernel.load(mod.default)
      loaded.set(id, mod.default)
    }),
  )
  notify()
}

export function useInstalledIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeInstalled, () => installedIds)
}

export function useMarketplaceManifest(): MarketplaceEntry[] | null {
  const [manifest, setManifest] = useState<MarketplaceEntry[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/plugins.json')
      .then((res) => res.json() as Promise<MarketplaceEntry[]>)
      .then((data) => {
        if (!cancelled) setManifest(data)
      })
      .catch(() => {
        if (!cancelled) setManifest([])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return manifest
}
