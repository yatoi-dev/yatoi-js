import { definePlugin } from '@yatoi/kernel'
import { Config } from '../contract.js'
import type { ServerConfig } from '../contract.js'

export function configPlugin(config: ServerConfig) {
  return definePlugin({
    name: `config:${config.dbUrl}:${config.features.join(',') || 'base'}`,
    provides: [Config],
    setup(scope) {
      scope.provide(Config, config)
    },
  })
}
