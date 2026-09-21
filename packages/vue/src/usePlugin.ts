import { onBeforeUnmount, onMounted } from 'vue'
import type { AnyPlugin, PluginHandle } from '@yatoi/kernel'
import { useKernel } from './context.js'

/**
 * Component-scoped plugin: loaded when this component mounts, unloaded
 * when it unmounts. Vue has no StrictMode double-invoke, but two Vue
 * situations rhyme with it and are covered by the same load → unload →
 * load contract: a component instance that unmounts and is immediately
 * replaced by a fresh one at the same spot (a `:key` change, or Vue's
 * HMR remounting a changed component), and `<KeepAlive>` — though a
 * kept-alive component only *deactivates*, it does not unmount, so this
 * plugin correctly stays loaded across deactivate/activate.
 *
 * The plugin object is the identity — define it at module scope. Two
 * mounted components using the same plugin object is an error (the
 * kernel refuses duplicate top-level loads); give each instance its own
 * plugin or hoist it to a kernel-scoped load.
 */
export function usePlugin(plugin: AnyPlugin): void {
  const kernel = useKernel()
  let handle: PluginHandle | undefined

  onMounted(() => {
    ;[handle] = kernel.load(plugin)
  })
  onBeforeUnmount(() => {
    handle?.dispose()
    handle = undefined
  })
}
