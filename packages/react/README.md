# `@yatoi/react`

React bindings for `@yatoi/kernel`: `KernelProvider`, `useService`,
`useServiceState`, `useContributions`, `Requires`, and `usePlugin`.

## Install

```bash
npm install @yatoi/kernel @yatoi/react react
```

React 18 and 19 are supported. Create the kernel outside the component tree;
React observes it but does not own it.

```tsx
import { createKernel } from '@yatoi/kernel'
import { KernelProvider, Requires } from '@yatoi/react'
import { Clock } from './contract.js'

const kernel = createKernel()

root.render(
  <KernelProvider kernel={kernel}>
    <Requires of={[Clock]} fallback={<p>Clock unavailable</p>}>
      {(clock) => <time>{clock.now()}</time>}
    </Requires>
  </KernelProvider>,
)
```

Load and unload plugins during bootstrap, event handlers, or effects—never
during render. `Requires` unmounts its subtree when a required service goes
away, so normal React cleanup follows the kernel's cascade.

See the [React guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md#consume-a-service-in-react)
and [example application](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo).

MIT
