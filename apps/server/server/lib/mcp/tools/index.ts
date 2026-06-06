import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';

export function registerTools(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'file-read',
          description: 'Read file from workspace',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'file-write',
          description: 'Write file to workspace',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['filePath', 'content'],
          },
        },
        {
          name: 'terminal-exec',
          description: 'Execute a terminal command',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              cwd: { type: 'string' },
            },
            required: ['command'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (!args) {
      throw new Error(`No arguments provided for tool ${name}`);
    }

    if (name === 'file-read') {
      const content = await fs.readFile(args.filePath as string, 'utf-8');
      return {
        content: [{ type: 'text', text: content }],
      };
    }

    if (name === 'file-write') {
      await fs.writeFile(args.filePath as string, args.content as string, 'utf-8');
      return {
        content: [{ type: 'text', text: `Successfully wrote to ${args.filePath}` }],
      };
    }

    if (name === 'terminal-exec') {
      // Stub for terminal exec using child_process
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(args.command as string, { cwd: args.cwd as string | undefined });
      return {
        content: [{ type: 'text', text: `STDOUT:\n${stdout}\nSTDERR:\n${stderr}` }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });
}
