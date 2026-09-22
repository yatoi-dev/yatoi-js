# `@yatoi/react`

[![npm](https://img.shields.io/npm/v/@yatoi/react.svg)](https://www.npmjs.com/package/@yatoi/react)
[![license](https://img.shields.io/npm/l/@yatoi/react.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

React bindings that observe an `@yatoi/kernel` through providers, hooks, capability gates, and component-scoped plugins.

## Install

```bash
npm i @yatoi/react react react-dom
```

```tsx
import { createKernel, definePlugin, defineService } from '@yatoi/kernel'
import { KernelProvider, Requires } from '@yatoi/react'
import { Slot } from '@yatoi/react/slots'
declare module '@yatoi/slots' { interface Slots { 'sidebar.item': Record<never, never> } }
const Clock = defineService<{ now(): number }>('clock')
const clock = definePlugin({ name: 'clock', provides: [Clock], setup(scope) {
  scope.provide(Clock, { now: () => Date.now() })
  scope.defer(() => console.log('clock stopped'))
} })
const kernel = createKernel()
kernel.load(clock)
export function App() { return <KernelProvider kernel={kernel}>
  <Requires of={[Clock]}>{(value) => <time>{value.now()}</time>}</Requires>
  <Slot name="sidebar.item" />
</KernelProvider> }
```

## Rules

- Never mutate the kernel during render; load and unload in bootstrap, event handlers, or effects.
- Import token symbols from one contract module; never use string literals at call sites.
- Prefer `<Requires>` over `useService(Token)!` so capability removal unmounts the dependent subtree.
- Define plugin objects outside components so their identity survives re-renders.
- Declare the host's `Slots` interface once in `@yatoi/slots`; import renderers from `@yatoi/react/slots`.

[Specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) · [Guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md) · [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) · [React example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo)

## More

React 18 and 19 are supported. Create the kernel outside the component tree; React observes it but does not own it. `Requires` unmounts its subtree when a required service disappears, so normal React cleanup follows the kernel cascade.

MIT
