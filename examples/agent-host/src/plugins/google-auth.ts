import { definePlugin } from '@yatoi/kernel'
import { GoogleAuth } from '../contract.js'

let counter = 0

/**
 * Nothing but a credential. Revocation is `kernel.unload(googleAuthPlugin)`
 * — the host never has a separate "revoke" API, it's the same unload every
 * other plugin gets, and that's what makes cascade unload apply to it for
 * free.
 */
export const googleAuthPlugin = definePlugin({
  name: 'google-auth',
  provides: [GoogleAuth],
  setup(scope) {
    counter += 1
    scope.provide(GoogleAuth, { accessToken: `tok-${counter}`, account: 'mj@example.com' })
  },
})
