import { useSyncExternalStore } from 'react'
import { useKernel } from '@yatoyi/react'
import { installPlugin, isAvailable, uninstallPlugin, useMarketplace } from './marketplace/useMarketplace.js'

export function Marketplace() {
  const kernel = useKernel()
  // `pluginState` isn't itself subscribable — it's a point-in-time read off
  // the kernel — so re-render on every kernel change (`version` bumps on
  // any load/unload/provide) to keep the activity badge honest.
  useSyncExternalStore(kernel.subscribe, () => kernel.version)
  const { manifest, installed, loaded, errors } = useMarketplace()

  if (manifest === null) return <p className="loading">Loading marketplace…</p>

  return (
    <div className="marketplace">
      {manifest.map((entry) => {
        const plugin = loaded.get(entry.id)
        const state = plugin ? kernel.pluginState(plugin) : null
        const error = errors.get(entry.id)
        // Installed but not loaded, with an error, means restore failed —
        // offer Retry and a way to give up and forget it.
        const failedInstall = installed.has(entry.id) && !plugin && error !== undefined

        return (
          <div key={entry.id} className="plugin-card">
            <div className="plugin-card-header">
              <h3>{entry.name}</h3>
              <span className="plugin-version">v{entry.version}</span>
              {state && <span className={`plugin-badge plugin-badge-${state}`}>{state}</span>}
            </div>
            <p>{entry.description}</p>
            {error && !plugin && <p className="plugin-error">Failed to load: {error}</p>}
            {!isAvailable(entry.id) ? (
              <button type="button" disabled title="No activation code registered for this plugin">
                Unavailable
              </button>
            ) : plugin ? (
              <button type="button" onClick={() => uninstallPlugin(entry.id)}>
                Uninstall
              </button>
            ) : (
              <div className="plugin-card-actions">
                <button type="button" onClick={() => void installPlugin(entry)}>
                  {error ? 'Retry install' : 'Install'}
                </button>
                {failedInstall && (
                  <button type="button" onClick={() => uninstallPlugin(entry.id)}>
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
