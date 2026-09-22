import { defineComponent, inject, provide, type InjectionKey, type PropType, type VNode } from 'vue'
import type { Kernel } from '@yatoi/kernel'

// Named `KernelKey`, not `KernelToken` — this is Vue's own `provide`/`inject`
// wiring, unrelated to a yatoi plugin's `inject` field on the kernel side.
// The names collide in vocabulary only; keep every comment here explicit
// about which "inject" it means.
/** Vue injection key used internally by the yatoi app and subtree providers. */
export const KERNEL_KEY: InjectionKey<Kernel> = Symbol('yatoi:kernel')

/**
 * Makes a kernel available to the subtree via Vue's `provide()` (Vue's
 * `inject()`, not a plugin's `inject:` field, resolves it back out). Call
 * from a root component's `setup()`, before anything below reads
 * `useKernel`/`useService`. The kernel outlives any render — Vue only
 * observes it; create it outside your component tree.
 *
 * Prefer `app.use(yatoi, { kernel })` for the whole-app case — it's the
 * default now. Reach for `provideKernel` (or `<KernelProvider>`) when a
 * subtree needs a *different* kernel than the app-level one (a nested or
 * scoped kernel), since `provide()` only overrides for descendants below
 * the call site.
 */
export function provideKernel(kernel: Kernel): void {
  provide(KERNEL_KEY, kernel)
}

/** Props for {@link KernelProvider}. */
export interface KernelProviderProps {
  /** Kernel observed by the descendant Vue tree. */
  kernel: Kernel
}

/**
 * Template-friendly wrapper over `provideKernel` for consumers who would
 * rather write `<KernelProvider :kernel="kernel"><App /></KernelProvider>`
 * than call `provideKernel` by hand in `setup()`. Renders its default slot.
 *
 * Like `provideKernel`, this is for the nested/scoped-kernel case now —
 * `app.use(yatoi, { kernel })` is the default for the whole-app kernel.
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
 * Reads the kernel provided by `app.use(yatoi, { kernel })`, an ancestor
 * `provideKernel()` call, or `<KernelProvider>`. Throws a clear error
 * outside all three, same contract as React's `useKernel`.
 */
export function useKernel(): Kernel {
  const kernel = inject(KERNEL_KEY, null)
  if (!kernel) {
    throw new Error(
      '[yatoi] useKernel: no kernel found — provide one with app.use(yatoi, { kernel }), ' +
        'provideKernel(), or <KernelProvider> above this component',
    )
  }
  return kernel
}
