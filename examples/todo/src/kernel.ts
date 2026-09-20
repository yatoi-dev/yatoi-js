import { createKernel } from '@yatoyi/kernel'

// One kernel for the whole app, created at module scope — it outlives any
// render tree. React only ever observes it (see docs/design.md "Kernel-scoped").
export const kernel = createKernel()

kernel.on('error', (error, plugin) => {
  console.error(`[yatoyi-example-todo] plugin "${plugin.name}" errored:`, error)
})
