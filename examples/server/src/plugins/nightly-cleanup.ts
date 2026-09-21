import { definePlugin } from '@yatoi/kernel'
import { DbConnection, Jobs } from '../contract.js'

export const nightlyCleanupPlugin = definePlugin({
  name: 'nightly-cleanup',
  inject: [DbConnection],
  setup(scope) {
    const db = scope.get(DbConnection)
    scope.contribute(Jobs, {
      name: 'nightly-cleanup',
      everyMs: 24 * 60 * 60 * 1000,
      run() {
        db.query('delete from todos where completed = true')
      },
    })
  },
})
