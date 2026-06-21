import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export interface McpServerConfig {
  id: string;
  name: string;
  url: string; // SSE endpoint URL
}

class McpRegistryService {
  private clients: Map<string, Client> = new Map();
  private configs: Map<string, McpServerConfig> = new Map();

  /**
   * Connect to an MCP server via SSE Transport.
   */
  async connectServer(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      console.warn(`[MCP] Server ${config.id} is already connected.`);
      return;
    }

    try {
      const transport = new SSEClientTransport(new URL(config.url));
      const client = new Client(
        {
          name: 'NYX-Client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);
      
      this.clients.set(config.id, client);
      this.configs.set(config.id, config);
      console.log(`[MCP] Successfully connected to server: ${config.name}`);
    } catch (error) {
      console.error(`[MCP] Failed to connect to server ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect an MCP server.
   */
  async disconnectServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      await client.close();
      this.clients.delete(id);
      this.configs.delete(id);
      console.log(`[MCP] Disconnected server: ${id}`);
    }
  }

  /**
   * Get all tools from all connected MCP servers.
   */
  async getAllTools(): Promise<any[]> {
    const allTools: any[] = [];
    const entries = Array.from(this.clients.entries());

    const promises = entries.map(async ([id, client]) => {
      try {
        const result = await client.listTools();
        return result.tools.map((t: any) => ({
          ...t,
          _mcpServerId: id,
        }));
      } catch (error) {
        console.error(`[MCP] Failed to list tools for server ${id}:`, error);
        return [];
      }
    });

    const results = await Promise.all(promises);
    for (const tools of results) {
      allTools.push(...tools);
    }

    return allTools;
  }

  /**
   * Execute a tool on a specific MCP server.
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`[MCP] Server ${serverId} not found or not connected`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      return result;
    } catch (error) {
      console.error(`[MCP] Tool execution failed [${serverId}:${toolName}]:`, error);
      throw error;
    }
  }

  /**
   * Check if a tool belongs to an MCP server (helper for toolExecutor)
   */
  async findServerForTool(toolName: string): Promise<string | null> {
    const tools = await this.getAllTools();
    const tool = tools.find((t) => t.name === toolName);
    return tool ? tool._mcpServerId : null;
  }

  getConnectedServers(): McpServerConfig[] {
    return Array.from(this.configs.values());
  }
}

export const McpRegistry = new McpRegistryService();
