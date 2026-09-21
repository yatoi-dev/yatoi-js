import { createKernel } from '@yatoi/kernel'

// One kernel for the whole app, created at module scope — it outlives any
// render tree. Vue only ever observes it (see docs/design.md "Kernel-scoped").
export const kernel = createKernel()

kernel.on('error', (error, plugin) => {
  console.error(`[yatoi-example-todo-vue] plugin "${plugin.name}" errored:`, error)
})
