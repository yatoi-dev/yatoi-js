import type { App, Plugin as VuePlugin } from 'vue'
import type { Kernel } from '@yatoi/kernel'
import { KERNEL_KEY } from './context.js'

/** Options passed to `app.use(yatoi, options)`. */
export interface YatoiOptions {
  /** Application-owned kernel to provide above the Vue tree. */
  kernel: Kernel
}

/**
 * Vue plugin (in Vue's sense — `app.use(...)`) that provides the kernel
 * to the whole app. This is the default way to wire up `@yatoi/vue`:
 *
 * ```ts
 * createApp(App).use(yatoi, { kernel }).mount('#app')
 * ```
 *
 * Prefer this over calling `provideKernel(kernel)` in a component's
 * `setup()`. Vue's `provide()` only reaches *descendant* component
 * instances, never the instance that called `provide()` itself — so a
 * root component that both provides the kernel and consumes it (via
 * `useKernel`/`useService`/`useContributions`/`<Requires>`) fails at
 * runtime, silently at the `provide()` call site and loudly later at
 * `useKernel()`. `app.use(yatoi, { kernel })` installs the kernel above
 * the whole component tree, including the root component, so this
 * mistake isn't reachable.
 *
 * Reach for `provideKernel`/`<KernelProvider>` instead when a subtree
 * needs a *different* kernel than the app-level one — a nested or
 * scoped kernel — since those still work and remain the right tool for
 * that case.
 */
export const yatoi: VuePlugin<YatoiOptions> = {
  install(app: App, options?: YatoiOptions) {
    if (!options?.kernel) {
      throw new Error('[yatoi] app.use(yatoi, { kernel }) — `kernel` is required')
    }
    app.provide(KERNEL_KEY, options.kernel)
  },
}
