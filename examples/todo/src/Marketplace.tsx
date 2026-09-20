import { useSyncExternalStore } from 'react'
import { useKernel } from '@weft/react'
import {
  getLoadedPlugin,
  installPlugin,
  isAvailable,
  uninstallPlugin,
  useInstalledIds,
  useMarketplaceManifest,
} from './marketplace/useMarketplace.js'

export function Marketplace() {
  const kernel = useKernel()
  // `pluginState` isn't itself subscribable — it's a point-in-time read off
  // the kernel — so re-render on every kernel change (`version` bumps on
  // any load/unload/provide) to keep the activity badge honest.
  useSyncExternalStore(kernel.subscribe, () => kernel.version)
  const manifest = useMarketplaceManifest()
  const installedIds = useInstalledIds()

  if (manifest === null) return <p className="loading">Loading marketplace…</p>

  return (
    <div className="marketplace">
      {manifest.map((entry) => {
        const installed = installedIds.has(entry.id)
        const available = isAvailable(entry.id)
        const plugin = getLoadedPlugin(entry.id)
        const state = plugin ? kernel.pluginState(plugin) : null

        return (
          <div key={entry.id} className="plugin-card">
            <div className="plugin-card-header">
              <h3>{entry.name}</h3>
              <span className="plugin-version">v{entry.version}</span>
              {state && <span className={`plugin-badge plugin-badge-${state}`}>{state}</span>}
            </div>
            <p>{entry.description}</p>
            {available ? (
              <button
                type="button"
                onClick={() => (installed ? uninstallPlugin(entry.id) : void installPlugin(entry.id))}
              >
                {installed ? 'Uninstall' : 'Install'}
              </button>
            ) : (
              <button type="button" disabled title="No activation code registered for this plugin">
                Unavailable
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
