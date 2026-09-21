import { defineComponent, inject, provide, type InjectionKey, type PropType, type VNode } from 'vue'
import type { Kernel } from '@yatoi/kernel'

// Named `KernelKey`, not `KernelToken` — this is Vue's own `provide`/`inject`
// wiring, unrelated to a yatoi plugin's `inject` field on the kernel side.
// The names collide in vocabulary only; keep every comment here explicit
// about which "inject" it means.
const KernelKey: InjectionKey<Kernel> = Symbol('yatoi:kernel')

/**
 * Makes a kernel available to the subtree via Vue's `provide()` (Vue's
 * `inject()`, not a plugin's `inject:` field, resolves it back out). Call
 * from a root component's `setup()`, before anything below reads
 * `useKernel`/`useService`. The kernel outlives any render — Vue only
 * observes it; create it outside your component tree.
 */
export function provideKernel(kernel: Kernel): void {
  provide(KernelKey, kernel)
}

export interface KernelProviderProps {
  kernel: Kernel
}

/**
 * Template-friendly wrapper over `provideKernel` for consumers who would
 * rather write `<KernelProvider :kernel="kernel"><App /></KernelProvider>`
 * than call `provideKernel` by hand in `setup()`. Renders its default slot.
 */
export const KernelProvider = defineComponent({
  name: 'KernelProvider',
  props: {
    kernel: { type: Object as PropType<Kernel>, required: true },
  },
  setup(props, { slots }) {
    provideKernel(props.kernel)
    return (): VNode[] | undefined => slots.default?.()
  },
})

/**
 * Reads the kernel provided by an ancestor `provideKernel()` call or
 * `<KernelProvider>`. Throws a clear error outside one, same contract as
 * React's `useKernel`.
 */
export function useKernel(): Kernel {
  const kernel = inject(KernelKey, null)
  if (!kernel) {
    throw new Error('[yatoi] useKernel: no provideKernel()/<KernelProvider> above this component')
  }
  return kernel
}
