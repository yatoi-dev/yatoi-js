# `@yatoi/react-slots`

React rendering for the framework-neutral `@yatoi/slots` contract. It exports
typed `contribute()` and `<Slot>` APIs.

## Install

```bash
npm install @yatoi/kernel @yatoi/react @yatoi/slots @yatoi/react-slots react
```

```tsx
import { contribute, Slot } from '@yatoi/react-slots'

declare module '@yatoi/slots' {
  interface Slots {
    'task.badge': { taskId: string }
  }
}

// In a plugin's setup:
contribute(scope, 'task.badge', ({ taskId }) => <Badge taskId={taskId} />)

// In the host:
<Slot name="task.badge" taskId={task.id} />
```

The slot name and props are checked against the host's `Slots` augmentation.
Contributions are scope effects: unloading the plugin removes its renderer
without an explicit unregister call.

See the [slot guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md#contribute-to-a-slot-plugin-side)
and [example application](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo).

MIT
