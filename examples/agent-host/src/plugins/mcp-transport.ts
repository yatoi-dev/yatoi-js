import { definePlugin } from '@yatoi/kernel'
import { McpTransport } from '../contract.js'
import type { ToolDef } from '../contract.js'

function weatherTool(transport: McpTransport): ToolDef {
  return {
    name: 'mcp.weather',
    description: 'Read the weather from the demo MCP server.',
    async run() {
      if (!transport.connected) throw new Error('MCP transport is disconnected')
      transport.calls += 1
      return 'MCP weather: clear, 24°C'
    },
  }
}

/** Test/demo observation hook, matching calendar-skill's `lastClient`. */
export let lastMcpTransport: McpTransport | undefined

/** A deterministic stand-in for one MCP server transport. */
export function fakeMcpTransportPlugin() {
  const transport: McpTransport = {
    connected: false,
    calls: 0,
    connect() {
      this.connected = true
    },
    disconnect() {
      this.connected = false
    },
    listTools() {
      return [weatherTool(this)]
    },
  }
  lastMcpTransport = transport

  return definePlugin({
    name: 'fake-mcp-transport',
    provides: [McpTransport],
    setup(scope) {
      scope.provide(McpTransport, transport)
    },
  })
}
