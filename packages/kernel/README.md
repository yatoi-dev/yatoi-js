# `@yatoi/kernel`

A framework-neutral plugin kernel with reversible effects, typed service
discovery, collections, child scopes, and cascade unload. It has no runtime
dependencies and does not require React, Vue, a DOM, or Node APIs.

## Install

```bash
npm install @yatoi/kernel
```

## Minimal example

```ts
import { createKernel, definePlugin, defineService } from '@yatoi/kernel'

interface Clock {
  now(): number
}

const Clock = defineService<Clock>('clock')
const clockPlugin = definePlugin({
  name: 'clock',
  provides: [Clock],
  setup(scope) {
    scope.provide(Clock, { now: () => Date.now() })
  },
})

const kernel = createKernel()
kernel.load(clockPlugin)

kernel.get(Clock)?.now()
kernel.unload(clockPlugin)
```

A plugin declares the capabilities it provides and requires. When a required
capability disappears, dependent plugins unload synchronously and their
registered effects are reversed. Loading the provider again allows those
dependents to activate again.

Read the [concepts](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/concepts.md),
[guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md), and
[protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md).

MIT
