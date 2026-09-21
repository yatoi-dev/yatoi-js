import { afterEach } from 'vitest'

// See packages/vue/test/setup.ts for why this is needed.
afterEach(() => {
  document.body.innerHTML = ''
})
