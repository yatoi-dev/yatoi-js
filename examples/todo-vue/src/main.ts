import { createApp, h } from 'vue'
import { KernelProvider } from '@yatoi/vue'
// The contract's Slots augmentation is pulled in transitively by any
// import from it below (App.vue, TodoList.vue) — see
// examples/todo-vue/src/contract/index.ts.
import { bootstrap } from './bootstrap.js'
import { kernel } from './kernel.js'
import App from './App.vue'
import './styles.css'

bootstrap()

// `<KernelProvider>` wraps `App` from here, rather than `App.vue` calling
// `provideKernel(kernel)` on itself — Vue's `provide()`/`inject()` only
// reaches *descendant* components, never the component instance that
// called `provide()`. `App.vue` itself needs the kernel (`useContributions`,
// `<Requires>`), so it must be a *consumer*, and something above it has to
// be the provider. `<KernelProvider>` is that something; there's no SFC
// root to put `provideKernel()` in otherwise, short of adding an extra
// wrapper component for no other purpose.
createApp({
  render: () => h(KernelProvider, { kernel }, () => h(App)),
}).mount('#app')
