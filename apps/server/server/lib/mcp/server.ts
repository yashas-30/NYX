import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';

export const server = new Server({
  name: 'nyx-mcp',
  version: '3.0.0'
}, {
  capabilities: {
    tools: {} // Capabilities are now declared within registerTools
  }
});

registerTools(server);

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
