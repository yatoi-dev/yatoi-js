
import { createKernel, type Kernel } from '../src/index.js'

/** A promise you resolve/reject by hand — keeps async tests deterministic. */
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let queued microtasks and macrotasks drain. */
export const flush = () => new Promise<void>((r) => setTimeout(r, 0))

/** Kernel with error events captured instead of logged. */
export function quietKernel(): { kernel: Kernel; errors: unknown[] } {
  const kernel = createKernel()
  const errors: unknown[] = []
  kernel.on('error', (e) => {
    errors.push(e)
  })
  return { kernel, errors }
}

/** Records every notification with a snapshot taken by `probe`. */
export function recordNotifications<T>(kernel: Kernel, probe: () => T): T[] {
  const seen: T[] = []
  kernel.subscribe(() => {
    seen.push(probe())
  })
  return seen
}
