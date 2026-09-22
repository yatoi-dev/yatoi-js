# `@yatoi/vue-slots`

Vue 3 rendering for the framework-neutral `@yatoi/slots` contract. It exports
typed `contribute()` and `<Slot>` APIs.

## Install

```bash
npm install @yatoi/kernel @yatoi/vue @yatoi/slots @yatoi/vue-slots vue
```

```ts
import { contribute } from '@yatoi/vue-slots'
import { h } from 'vue'

declare module '@yatoi/slots' {
  interface Slots {
    'task.badge': { taskId: string }
  }
}

// In a plugin's setup:
contribute(scope, 'task.badge', ({ taskId }) => h(Badge, { taskId }))
```

```vue
<script setup lang="ts">
import { Slot } from '@yatoi/vue-slots'
</script>

<template>
<!-- In the host: -->
  <Slot name="task.badge" :task-id="task.id" />
</template>
```

The slot name and props are checked against the host's `Slots` augmentation.
Contributions are scope effects: unloading the plugin removes its renderer
without an explicit unregister call.

See the [Vue slot guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md#using-it-from-vue)
and [Vue example](https://github.com/yatoi-dev/yatoi-js/tree/main/examples/todo-vue).

MIT
