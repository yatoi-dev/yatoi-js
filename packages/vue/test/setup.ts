import { afterEach } from 'vitest'

// @vue/test-utils has no global auto-cleanup (unlike @testing-library/react):
// each `mount()` call attaches to a detached div unless told otherwise, and
// wrappers don't unmount themselves between tests. Resetting the document
// body is the same safety net React's setup.ts gets from `cleanup()`.
afterEach(() => {
  document.body.innerHTML = ''
})
