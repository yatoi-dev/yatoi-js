import { createContext, useContext, type ReactNode } from 'react'
import type { Kernel } from '@weft/kernel'

const KernelContext = createContext<Kernel | null>(null)

export interface KernelProviderProps {
  kernel: Kernel
  children?: ReactNode
}

/**
 * Makes a kernel available to the tree. The kernel outlives any render —
 * React only observes it. Create it outside your component tree (module
 * scope or a ref); never inside render.
 */
export function KernelProvider({ kernel, children }: KernelProviderProps) {
  return <KernelContext.Provider value={kernel}>{children}</KernelContext.Provider>
}

export function useKernel(): Kernel {
  const kernel = useContext(KernelContext)
  if (!kernel) {
    throw new Error('[weft] useKernel: no <KernelProvider> above this component')
  }
  return kernel
}
