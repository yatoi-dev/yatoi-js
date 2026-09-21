<script setup lang="ts">
import { computed, onScopeDispose, shallowRef } from 'vue'
import { useKernel } from '@yatoi/vue'
import { installPlugin, isAvailable, uninstallPlugin, useMarketplace } from './marketplace/useMarketplace.js'

const kernel = useKernel()
// `pluginState` isn't itself subscribable — it's a point-in-time read off
// the kernel — so re-render on every kernel change (`version` bumps on
// any load/unload/provide) to keep the activity badge honest. The Vue
// equivalent of the React version's `useSyncExternalStore(kernel.subscribe,
// () => kernel.version)`.
const version = shallowRef(kernel.version)
const unsubscribe = kernel.subscribe(() => {
  version.value = kernel.version
})
onScopeDispose(unsubscribe)

const marketplace = useMarketplace()

const entries = computed(() => {
  void version.value // establish the reactive dependency
  const { manifest, installed, loaded, errors } = marketplace.value
  if (manifest === null) return null
  return manifest.map((entry) => {
    const plugin = loaded.get(entry.id)
    const state = plugin ? kernel.pluginState(plugin) : null
    const error = errors.get(entry.id)
    // Installed but not loaded, with an error, means restore failed —
    // offer Retry and a way to give up and forget it.
    const failedInstall = installed.has(entry.id) && !plugin && error !== undefined
    return { entry, plugin, state, error, failedInstall }
  })
})
</script>

<template>
  <p v-if="entries === null" class="loading">Loading marketplace…</p>
  <div v-else class="marketplace">
    <div v-for="row in entries" :key="row.entry.id" class="plugin-card">
      <div class="plugin-card-header">
        <h3>{{ row.entry.name }}</h3>
        <span class="plugin-version">v{{ row.entry.version }}</span>
        <span v-if="row.state" :class="`plugin-badge plugin-badge-${row.state}`">{{ row.state }}</span>
      </div>
      <p>{{ row.entry.description }}</p>
      <p v-if="row.error && !row.plugin" class="plugin-error">Failed to load: {{ row.error }}</p>
      <button
        v-if="!isAvailable(row.entry.id)"
        type="button"
        disabled
        title="No activation code registered for this plugin"
      >
        Unavailable
      </button>
      <button v-else-if="row.plugin" type="button" @click="uninstallPlugin(row.entry.id)">Uninstall</button>
      <div v-else class="plugin-card-actions">
        <button type="button" @click="installPlugin(row.entry)">
          {{ row.error ? 'Retry install' : 'Install' }}
        </button>
        <button v-if="row.failedInstall" type="button" @click="uninstallPlugin(row.entry.id)">Remove</button>
      </div>
    </div>
  </div>
</template>
