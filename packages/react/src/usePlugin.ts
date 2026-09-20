import { useEffect } from 'react'
import type { AnyPlugin } from '@yatoyi/kernel'
import { useKernel } from './context.js'

/**
 * Component-scoped plugin: loaded when this component mounts, unloaded
 * when it unmounts. React owns the lifetime. StrictMode's double-invoke
 * becomes load → unload → load, which the kernel handles.
 *
 * The plugin object is the identity — define it at module scope. Two
 * mounted components using the same plugin object is an error (the kernel
 * refuses duplicate top-level loads); give each instance its own plugin or
 * hoist it to a kernel-scoped load.
 */
export function usePlugin(plugin: AnyPlugin): void {
  const kernel = useKernel()
  useEffect(() => {
    const [handle] = kernel.load(plugin)
    return () => handle!.dispose()
  }, [kernel, plugin])
}
