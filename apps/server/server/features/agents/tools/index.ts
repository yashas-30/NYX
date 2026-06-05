import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot } from '../../../lib/paths.js';
import { runInSandbox } from '../../../sandbox/dockerSandbox.js';
import { CodebaseRAG } from '../../rag/index.js';
import { SearchService } from '../../nyx/search.service.js';

const searchService = new SearchService();

function resolveWorkspacePath(relativePath: string): string {
  const root = getWorkspaceRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function validateArgs(args: any, parameters: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (parameters.required) {
    for (const req of parameters.required) {
      if (args[req] === undefined) {
        errors.push(`Missing required parameter: ${req}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    },
    handler: async ({ path }: { path: string }) => {
      const fullPath = resolveWorkspacePath(path);
      const content = await fs.promises.readFile(fullPath, 'utf8');
      return { content, path };
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    },
    handler: async ({ path: targetPath, content }: { path: string; content: string }) => {
      const fullPath = resolveWorkspacePath(targetPath);
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, content, 'utf8');
      return { success: true, path: targetPath };
    }
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the workspace',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout: { type: 'number', default: 30000 }
      },
      required: ['command']
    },
    handler: async ({ command, timeout }: { command: string; timeout: number }) => {
      return runInSandbox(command, getWorkspaceRoot());
    }
  },
  {
    name: 'search_codebase',
    description: 'Search the codebase for relevant files',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', default: 5 }
      },
      required: ['query']
    },
    handler: async ({ query, topK }: { query: string; topK: number }) => {
      const rag = new CodebaseRAG();
      await rag.initialize(getWorkspaceRoot());
      return rag.search(query, topK || 5);
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    },
    handler: async ({ query }: { query: string }) => {
      return searchService.performWebSearch(query);
    }
  }
];

// Tool execution with validation
export async function executeTool(name: string, args: any): Promise<any> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Validate arguments against schema
  const valid = validateArgs(args, tool.parameters);
  if (!valid.valid) {
    throw new Error(`Invalid arguments: ${valid.errors.join(', ')}`);
  }

  return tool.handler(args);
}
