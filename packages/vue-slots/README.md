# `@yatoi/vue-slots`

[![npm](https://img.shields.io/npm/v/@yatoi/vue-slots.svg)](https://www.npmjs.com/package/@yatoi/vue-slots)
[![license](https://img.shields.io/npm/l/@yatoi/vue-slots.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

Vue 3 rendering for the framework-neutral `@yatoi/slots` contract through typed `contribute()` and `<Slot>` APIs.

## Install

```bash
npm i @yatoi/kernel @yatoi/vue @yatoi/slots @yatoi/vue-slots vue
```

```ts
import { createKernel, definePlugin } from '@yatoi/kernel'
import { defineComponent, h } from 'vue'
import { KernelProvider } from '@yatoi/vue'
import { contribute, Slot } from '@yatoi/vue-slots'
declare module '@yatoi/slots' {
  interface Slots { 'task.badge': { taskId: string } }
}
const badges = definePlugin({ name: 'badges', setup(scope) {
  contribute(scope, 'task.badge', ({ taskId }) => h('strong', taskId))
} })
const kernel = createKernel()
kernel.load(badges)
export const App = defineComponent(() => () => h(KernelProvider, { kernel }, {
  default: () => h(Slot, { name: 'task.badge', taskId: '42' }),
}))
```

## Rules

- The host declares the `Slots` interface once in a contract module imported by host and plugins.
- Never mutate the kernel during render or a component's `setup()` body; contribute only from plugin setup.
- Import token and slot symbols; never use bare token keys at call sites.
- Prefer `<Requires>` over asserting that `useService(Token).value` is present.

[Specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) · [Guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md) · [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) · [Vue example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo-vue)

## More

Slot names and props are checked against the host's `Slots` augmentation. Contributions are scope effects: unloading the plugin removes its renderer without an explicit unregister call.

MIT
