/**
 * @file src/core/services/toolSystem.ts
 * @description Core Tool Registry and Tool Executor for the NYX autonomous agent.
 */

import { AIService } from './ai.service';
import { WorkspaceIntelligence } from './workspaceIntelligence';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace, optionally between specific lines.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file in the workspace.' },
        startLine: { type: 'number', description: 'Optional 1-based start line (inclusive).' },
        endLine: { type: 'number', description: 'Optional 1-based end line (inclusive).' }
      },
      required: ['path']
    }
  },
  {
    name: 'edit_file',
    description: 'Update the content of an existing file (complete drop-in rewrite).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file to modify.' },
        content: { type: 'string', description: 'The complete new content for the file.' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'write_file',
    description: 'Create a new file in the workspace with the specified content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path where the file should be created.' },
        content: { type: 'string', description: 'The file contents.' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'search_codebase',
    description: 'Perform a semantic neural and fuzzy search across the codebase.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query describing code blocks, functions, or patterns.' }
      },
      required: ['query']
    }
  },
  {
    name: 'run_terminal',
    description: 'Execute a command in the terminal sandbox and capture stdout/stderr.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command line to run.' },
        cwd: { type: 'string', description: 'Optional relative path to execute the command in.' }
      },
      required: ['command']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for API documentation, libraries, or general questions.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The web search query.' }
      },
      required: ['query']
    }
  },
  {
    name: 'list_directory',
    description: 'List directories and files in a specific folder path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional relative path to inspect. Defaults to workspace root.' }
      },
      required: []
    }
  },
  {
    name: 'git_diff',
    description: 'Inspect current uncommitted changes or diff of a specific file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional relative path to show diff for.' }
      },
      required: []
    }
  },
  {
    name: 'git_status',
    description: 'Show current git status (modified, untracked, and staged files).',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export class ToolExecutor {
  static async execute(toolName: string, params: Record<string, any>, signal?: AbortSignal): Promise<any> {
    console.log(`[ToolExecutor] Invoking: ${toolName} with params:`, params);

    switch (toolName) {
      case 'read_file': {
        WorkspaceIntelligence.trackOpenFile(params.path);
        const res = await AIService.fetchWithAuth('/api/nyx/read-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            startLine: params.startLine,
            endLine: params.endLine
          }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to read file');
        return data.content;
      }

      case 'edit_file': {
        WorkspaceIntelligence.trackOpenFile(params.path);
        const res = await AIService.fetchWithAuth('/api/nyx/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            content: params.content,
            overwrite: true
          }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to edit file');
        return `Successfully edited file: ${params.path}`;
      }

      case 'write_file': {
        WorkspaceIntelligence.trackOpenFile(params.path);
        const res = await AIService.fetchWithAuth('/api/nyx/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            content: params.content,
            overwrite: false
          }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to write file');
        return `Successfully created new file: ${params.path}`;
      }

      case 'search_codebase': {
        const res = await AIService.fetchWithAuth('/api/nyx/codebase-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: params.query }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Codebase search failed');
        return data.results;
      }

      case 'run_terminal': {
        const res = await AIService.fetchWithAuth('/api/terminal/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: params.command,
            cwd: params.cwd
          }),
          signal
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Command execution failed: ${data.stderr}`);
        }
        return {
          stdout: data.stdout,
          stderr: data.stderr
        };
      }

      case 'web_search': {
        const res = await AIService.fetchWithAuth('/api/nyx/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: params.query }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Web search failed');
        return data.results;
      }

      case 'list_directory': {
        const res = await AIService.fetchWithAuth('/api/nyx/list-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: params.path }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to list directory');
        return data.files;
      }

      case 'git_diff': {
        const res = await AIService.fetchWithAuth('/api/nyx/git-diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: params.path }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch git diff');
        return data.diff;
      }

      case 'git_status': {
        const res = await AIService.fetchWithAuth('/api/nyx/git-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch git status');
        return data.status;
      }

      default:
        throw new Error(`Unsupported tool: ${toolName}`);
    }
  }
}
