import { definePlugin } from '@yatoi/kernel'
import { Config, DbConnection } from '../contract.js'

let connectionNumber = 0

export const databasePlugin = definePlugin({
  name: 'database',
  inject: [Config],
  provides: [DbConnection],
  async setup(scope) {
    const config = scope.get(Config)
    // Keep `starting` observable without adding timers or real I/O.
    await Promise.resolve()
    if (!scope.active) return

    const id = ++connectionNumber
    const connection = {
      closed: false,
      query(sql: string) {
        if (this.closed) throw new Error('database connection is closed')
        return `db#${id}@${config.dbUrl}: ${sql}`
      },
    }
    scope.defer(() => {
      connection.closed = true
    })
    scope.provide(DbConnection, connection)
  },
})
