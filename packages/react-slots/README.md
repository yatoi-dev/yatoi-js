# `@yatoi/react-slots`

[![npm](https://img.shields.io/npm/v/@yatoi/react-slots.svg)](https://www.npmjs.com/package/@yatoi/react-slots)
[![license](https://img.shields.io/npm/l/@yatoi/react-slots.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

React rendering for the framework-neutral `@yatoi/slots` contract through typed `contribute()` and `<Slot>` APIs.

## Install

```bash
npm i @yatoi/kernel @yatoi/react @yatoi/slots @yatoi/react-slots react react-dom
```

```tsx
import { createKernel, definePlugin } from '@yatoi/kernel'
import { KernelProvider } from '@yatoi/react'
import { contribute, Slot } from '@yatoi/react-slots'
declare module '@yatoi/slots' {
  interface Slots { 'task.badge': { taskId: string } }
}
const badges = definePlugin({ name: 'badges', setup(scope) {
  contribute(scope, 'task.badge', ({ taskId }) => <strong>{taskId}</strong>)
} })
const kernel = createKernel()
kernel.load(badges)
export function App() { return <KernelProvider kernel={kernel}>
  <Slot name="task.badge" taskId="42" />
</KernelProvider> }
```

## Rules

- The host declares the `Slots` interface once in a contract module imported by host and plugins.
- Never mutate the kernel during render; contribute only from plugin setup and load plugins in bootstrap, handlers, or effects.
- Import token and slot symbols; never use bare token keys at call sites.
- Prefer `<Requires>` over `useService(Token)!` when a renderer requires a service.

[Specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) · [Guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md) · [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) · [React example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo)

## More

Slot names and props are checked against the host's `Slots` augmentation. Contributions are scope effects: unloading the plugin removes its renderer without an explicit unregister call.

MIT
