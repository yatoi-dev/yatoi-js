# `@yatoi/vue`

[![npm](https://img.shields.io/npm/v/@yatoi/vue.svg)](https://www.npmjs.com/package/@yatoi/vue)
[![license](https://img.shields.io/npm/l/@yatoi/vue.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

Vue 3 bindings that observe an `@yatoi/kernel` through an app plugin, providers, composables, capability gates, and component-scoped plugins.

## Install

```bash
npm i @yatoi/kernel @yatoi/vue vue
```

```ts
import { createApp, defineComponent, h } from 'vue'
import { createKernel, definePlugin, defineService } from '@yatoi/kernel'
import { Requires, yatoi } from '@yatoi/vue'
const Clock = defineService<{ now(): number }>('clock')
const clock = definePlugin({ name: 'clock', provides: [Clock], setup(scope) {
  scope.provide(Clock, { now: () => Date.now() })
  scope.defer(() => console.log('clock stopped'))
} })
const kernel = createKernel()
kernel.load(clock)
const App = defineComponent(() => () => h(Requires, { of: [Clock] }, {
  default: ([value]) => h('time', value.now()),
}))
createApp(App).use(yatoi, { kernel }).mount('#app')
```

## Rules

- Never mutate the kernel during render or a component's `setup()` body; load in bootstrap, handlers, or lifecycle hooks.
- Import token symbols from one contract module; never use string literals at call sites.
- Prefer `<Requires>` over asserting that `useService(Token).value` is present.
- Define plugin objects outside components so their identity survives remounts.

[Specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) · [Guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md) · [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) · [Vue example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo-vue)

## More

Use `app.use(yatoi, { kernel })` for the application kernel. Reach for `provideKernel` or `KernelProvider` when a subtree needs a different kernel; Vue observes the kernel but does not own it.

MIT
