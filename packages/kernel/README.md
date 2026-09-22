# `@yatoi/kernel`

[![npm](https://img.shields.io/npm/v/@yatoi/kernel.svg)](https://www.npmjs.com/package/@yatoi/kernel)
[![license](https://img.shields.io/npm/l/@yatoi/kernel.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

A framework-neutral plugin kernel with reversible effects, typed service discovery, collections, child scopes, and cascade unload.

## Install

```bash
npm i @yatoi/kernel
```

```ts
import { createKernel, definePlugin, defineService } from '@yatoi/kernel'
const Clock = defineService<{ now(): number }>('clock')
const clock = definePlugin({ name: 'clock', provides: [Clock], setup(scope) {
  const timer = { stop() {} }
  scope.provide(Clock, { now: () => Date.now() })
  scope.defer(() => timer.stop())
} })
const reader = definePlugin({ name: 'reader', inject: [Clock], setup(scope) {
  console.log(scope.get(Clock).now())
} })
const kernel = createKernel()
kernel.load(clock, reader)
```

## Rules

- Never mutate the kernel during render; load and unload in bootstrap, event handlers, or framework effects.
- Import token symbols from one contract module; never use string literals at call sites.
- The kernel has no DOM or Node types; keep platform effects inside plugins or hosts.
- Read `kernel.state()` and `kernel.list()` at the boundary of each unit of work instead of caching results.

[Specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) · [Guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md) · [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) · [Server example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/server)

## More

The package has no runtime dependencies and requires neither a UI framework nor platform APIs. When a required capability disappears, dependent plugins unload synchronously and every registered effect is reversed. Loading the provider again allows those dependents to activate again.

MIT
