import { definePlugin } from '@yatoi/kernel'
import { McpTransport, PromptSections, Tools } from '../contract.js'

/**
 * Adapts one connected MCP server into the host's ordinary tool and prompt
 * collections. The connection disappearing removes every contribution as
 * part of scope disposal; there is no second MCP-specific registry.
 */
export const mcpConnectionPlugin = definePlugin({
  name: 'mcp-connection',
  inject: [McpTransport],
  setup(scope) {
    const transport = scope.get(McpTransport)
    transport.connect()
    scope.defer(() => transport.disconnect())

    for (const tool of transport.listTools()) scope.contribute(Tools, tool)
    scope.contribute(PromptSections, { text: 'An MCP server named demo-weather is connected.' })
  },
})
