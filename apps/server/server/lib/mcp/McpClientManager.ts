import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import logger from '../logger.js';
import { randomUUID } from 'crypto';

export interface McpServerConfig {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

export class McpClientManager {
  private clients: Map<string, { client: Client; config: McpServerConfig }> = new Map();

  /**
   * Connect to an MCP server using either stdio or SSE transport.
   */
  async connectServer(config: McpServerConfig): Promise<void> {
    logger.info({ serverName: config.name, type: config.type }, '[MCP] Connecting to server...');
    config.status = 'connecting';
    config.error = undefined;

    try {
      const client = new Client(
        {
          name: 'nyx-mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      let transport;

      if (config.type === 'stdio') {
        if (!config.command) throw new Error('Stdio transport requires a command');
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env, ...config.env } as Record<string, string>,
        });
      } else if (config.type === 'sse') {
        if (!config.url) throw new Error('SSE transport requires a URL');
        transport = new SSEClientTransport(new URL(config.url));
      } else {
        throw new Error(`Unsupported MCP transport type: ${config.type}`);
      }

      await client.connect(transport);
      
      config.status = 'connected';
      this.clients.set(config.id, { client, config });
      logger.info({ serverName: config.name }, '[MCP] Successfully connected to server');
      
    } catch (error: any) {
      config.status = 'error';
      config.error = error.message;
      logger.error({ serverName: config.name, error: error.message }, '[MCP] Failed to connect to server');
      throw error;
    }
  }

  /**
   * Get all registered MCP tools across all connected servers.
   */
  async getAvailableTools(): Promise<any[]> {
    const allTools: any[] = [];

    for (const [serverId, { client, config }] of this.clients.entries()) {
      if (config.status !== 'connected') continue;
      
      try {
        const response = await client.listTools();
        for (const tool of response.tools) {
          // Prefix the tool name with the server ID to avoid collisions
          allTools.push({
            type: 'function',
            function: {
              name: `mcp_${serverId}_${tool.name}`,
              description: `[From MCP Server: ${config.name}] ${tool.description || ''}`,
              parameters: tool.inputSchema,
            }
          });
        }
      } catch (error: any) {
        logger.error({ serverName: config.name, error: error.message }, '[MCP] Failed to fetch tools from server');
      }
    }

    return allTools;
  }

  /**
   * Execute an MCP tool by parsing the prefixed name.
   */
  async executeTool(prefixedName: string, args: any): Promise<any> {
    const match = prefixedName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match) {
      throw new Error(`Invalid MCP tool name format: ${prefixedName}`);
    }

    const [, serverId, toolName] = match;
    const serverConnection = this.clients.get(serverId);

    if (!serverConnection || serverConnection.config.status !== 'connected') {
      throw new Error(`MCP Server ${serverId} is not connected or does not exist.`);
    }

    logger.info({ serverName: serverConnection.config.name, toolName }, '[MCP] Executing tool');

    try {
      const result = await serverConnection.client.callTool({
        name: toolName,
        arguments: args,
      });
      return result;
    } catch (error: any) {
      logger.error({ serverName: serverConnection.config.name, toolName, error: error.message }, '[MCP] Tool execution failed');
      throw error;
    }
  }

  /**
   * Disconnect and remove a server.
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.clients.get(serverId);
    if (connection) {
      try {
        await connection.client.close();
      } catch (err) {
        // Ignore close errors
      }
      this.clients.delete(serverId);
      logger.info({ serverId }, '[MCP] Disconnected server');
    }
  }
}

export const mcpClientManager = new McpClientManager();
