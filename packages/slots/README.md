# `@yatoi/slots`

[![npm](https://img.shields.io/npm/v/@yatoi/slots.svg)](https://www.npmjs.com/package/@yatoi/slots)
[![license](https://img.shields.io/npm/l/@yatoi/slots.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

The framework-neutral slot contract for declaring typed contribution points on `@yatoi/kernel`.

## Install

```bash
npm i @yatoi/kernel @yatoi/slots
```

```ts
import { createKernel, definePlugin } from '@yatoi/kernel'
import { slot } from '@yatoi/slots'
declare module '@yatoi/slots' {
  interface Slots { 'task.badge': { taskId: string } }
}
const badges = definePlugin({ name: 'badges', setup(scope) {
  scope.contribute(slot('task.badge'), 'badge renderer')
} })
const kernel = createKernel()
kernel.load(badges)
console.log(kernel.list(slot('task.badge')).length)
```

## Rules

- The host declares the `Slots` interface once in a contract module imported by host and plugins.
- Import `slot` and the host contract; never construct `slot:*` string keys at call sites.
- Keep `@yatoi/slots` framework-neutral; rendering belongs in `@yatoi/react-slots` or `@yatoi/vue-slots`.
- Never mutate the kernel during render; contributions belong in plugin setup.

[Specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) · [Guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md) · [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) · [React example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo)

## More

Every slot is an ordinary kernel collection. Contributions therefore disappear automatically when their owning plugin unloads, without a separate unregister operation.

MIT
