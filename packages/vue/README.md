# `@yatoi/vue`

[![npm](https://img.shields.io/npm/v/@yatoi/vue.svg)](https://www.npmjs.com/package/@yatoi/vue)
[![license](https://img.shields.io/npm/l/@yatoi/vue.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

Vue 3 bindings for `@yatoi/kernel`: the `yatoi` app plugin,
`provideKernel`, `KernelProvider`, `useService`, `useServiceState`,
`useContributions`, `Requires`, and `usePlugin`.

## Install

```bash
npm install @yatoi/kernel @yatoi/vue vue
```

Install one kernel above the application root:

```ts
import { createApp } from 'vue'
import { createKernel } from '@yatoi/kernel'
import { yatoi } from '@yatoi/vue'
import App from './App.vue'

const kernel = createKernel()
createApp(App).use(yatoi, { kernel }).mount('#app')
```

Use `provideKernel` or `KernelProvider` when a subtree needs a different
kernel. Load and unload plugins during bootstrap, event handlers, or Vue
lifecycle effects—never while rendering.

See the [Vue guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md#using-it-from-vue)
and [Vue example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo-vue).

MIT
