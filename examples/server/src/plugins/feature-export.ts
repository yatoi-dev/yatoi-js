import { definePlugin } from '@yatoi/kernel'
import { Config, Routes } from '../contract.js'

export const featureExportPlugin = definePlugin({
  name: 'feature-export',
  inject: [Config],
  setup(scope) {
    const config = scope.get(Config)
    if (!config.features.includes('export')) return

    scope.contribute(Routes, {
      method: 'GET',
      path: '/export',
      handle() {
        return { status: 200, body: 'todo-1,todo-2' }
      },
    })
  },
})
