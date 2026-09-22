import { createContext, useContext, type ReactNode } from 'react'
import type { Kernel } from '@yatoi/kernel'

const KernelContext = createContext<Kernel | null>(null)

/** Props for {@link KernelProvider}. */
export interface KernelProviderProps {
  /** Kernel observed by the descendant React tree. */
  kernel: Kernel
  /** Descendant elements that may consume the kernel. */
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

/** Return the nearest kernel or throw when no {@link KernelProvider} exists. */
export function useKernel(): Kernel {
  const kernel = useContext(KernelContext)
  if (!kernel) {
    throw new Error('[yatoi] useKernel: no <KernelProvider> above this component')
  }
  return kernel
}
