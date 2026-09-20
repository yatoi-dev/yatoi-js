import { createKernel } from '@weft/kernel'

// One kernel for the whole app, created at module scope — it outlives any
// render tree. React only ever observes it (see CLAUDE.md "Kernel-scoped").
export const kernel = createKernel()

kernel.on('error', (error, plugin) => {
  console.error(`[weft-example-todo] plugin "${plugin.name}" errored:`, error)
})
