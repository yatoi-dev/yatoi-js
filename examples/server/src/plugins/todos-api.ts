import { definePlugin } from '@yatoi/kernel'
import { DbConnection, Routes } from '../contract.js'

export const todosApiPlugin = definePlugin({
  name: 'todos-api',
  inject: [DbConnection],
  setup(scope) {
    const db = scope.get(DbConnection)
    scope.contribute(Routes, {
      method: 'GET',
      path: '/todos',
      handle() {
        return { status: 200, body: db.query('select * from todos') }
      },
    })
    scope.contribute(Routes, {
      method: 'POST',
      path: '/todos',
      handle() {
        return { status: 201, body: db.query('insert into todos values (...)') }
      },
    })
  },
})
