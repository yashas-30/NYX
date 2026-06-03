import { Agent, createTool } from '@cline/sdk';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { FilesystemService } from '../nyx/filesystem.service.ts';
import { SearchService } from '../nyx/search.service.ts';
import { WorkspaceService } from '../nyx/workspace.service.ts';
import { AgentService } from '../nyx/agent.service.ts';
import { TerminalService } from '../terminal/terminal.service.ts';
import { getWorkspaceRoot } from '../../lib/paths.ts';
import logger from '../../lib/logger.ts';

const filesystemService = new FilesystemService();
const searchService = new SearchService();
const workspaceService = new WorkspaceService();
const agentService = new AgentService();

// ── Custom Tools Definitions ──────────────────────────────────────────────────

const readFileTool = createTool({
  name: 'read_file',
  description: 'Read the contents of a file in the workspace.',
  inputSchema: z.object({
    path: z.string().describe('File path relative to workspace root'),
    startLine: z.number().optional().describe('Start line number'),
    endLine: z.number().optional().describe('End line number'),
  }),
  async execute(input) {
    try {
      const content = await filesystemService.readFile(input.path, input.startLine, input.endLine);
      return content;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
});

const writeFileTool = createTool({
  name: 'write_file',
  description: 'Write or overwrite a file in the workspace.',
  inputSchema: z.object({
    path: z.string().describe('File path relative to workspace root'),
    content: z.string().describe('Complete file content to write'),
    overwrite: z.boolean().optional().describe('Whether to overwrite if exists'),
  }),
  async execute(input) {
    try {
      const result = await filesystemService.writeFile(input.path, input.content, input.overwrite);
      return JSON.stringify(result);
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
});

const runCommandTool = createTool({
  name: 'run_command',
  description: 'Execute a terminal command in the workspace.',
  inputSchema: z.object({
    command: z.string().describe('Command to run'),
    cwd: z.string().optional().describe('Working directory'),
  }),
  async execute(input) {
    const { command, cwd } = input;
    const { child, error } = await TerminalService.spawn(command, cwd);
    if (error) {
      return `Error: ${error}`;
    }
    if (!child) {
      return `Error: Failed to spawn sandbox process.`;
    }
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('close', (code) => {
        resolve(`Exit code: ${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`);
      });
      child.on('error', (err) => {
        resolve(`Process error: ${err.message}\nStdout:\n${stdout}\nStderr:\n${stderr}`);
      });
    });
  },
});

const searchCodebaseTool = createTool({
  name: 'search_codebase',
  description: 'Search the current workspace codebase for files, functions, classes, or patterns.',
  inputSchema: z.object({
    query: z.string().describe('Search query for codebase'),
  }),
  async execute(input) {
    try {
      const result = await searchService.codebaseSearch(input.query);
      return JSON.stringify({
        results: result.results.map((f: any) => ({
          path: f.relativePath || f.path,
          score: f.relevanceScore || f.score,
          snippet: f.content?.slice(0, 500),
        })),
        directoryStructure: result.directoryStructure,
      });
    } catch (err: any) {
      return `Error searching codebase: ${err.message}`;
    }
  },
});

const webSearchTool = createTool({
  name: 'web_search',
  description: 'Search the web for current information, documentation, or examples.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
  }),
  async execute(input) {
    try {
      const results = await searchService.performWebSearch(input.query);
      return JSON.stringify(
        results.slice(0, 5).map((r: any) => ({
          title: r.title,
          url: r.link || r.url,
          snippet: r.snippet,
        }))
      );
    } catch (err: any) {
      return `Error searching web: ${err.message}`;
    }
  },
});

const validateCodeTool = createTool({
  name: 'validate_code',
  description: 'Run linting, type checking, or tests on the workspace to verify correctness.',
  inputSchema: z.object({}),
  async execute(input) {
    try {
      const result = await workspaceService.validateWorkspace();
      return JSON.stringify(result);
    } catch (err: any) {
      return `Error validating workspace: ${err.message}`;
    }
  },
});

const getWorkspaceInfoTool = createTool({
  name: 'get_workspace_info',
  description:
    'Get information about the current workspace: file tree, package.json dependencies, tech stack detected.',
  inputSchema: z.object({}),
  async execute(input) {
    try {
      const files = filesystemService.listDirectory();
      return JSON.stringify({
        root: getWorkspaceRoot(),
        fileCount: files.length,
        topLevelFiles: files.slice(0, 20),
      });
    } catch (err: any) {
      return `Error getting workspace info: ${err.message}`;
    }
  },
});

const runCodeTool = createTool({
  name: 'run_code',
  description:
    'Execute code snippets (Node.js, Python, or shell) in a temporary local environment.',
  inputSchema: z.object({
    code: z.string().describe('The exact code to execute.'),
    language: z
      .enum(['javascript', 'typescript', 'python', 'sh'])
      .describe('The programming language of the code.'),
  }),
  async execute(input) {
    try {
      const extMap: Record<string, string> = {
        javascript: 'js',
        typescript: 'ts',
        python: 'py',
        sh: 'sh',
      };
      const ext = extMap[input.language] || 'txt';
      const workspacePath = getWorkspaceRoot();
      const tempFile = path.join(workspacePath, `.nyx_temp_code.${ext}`);

      fs.writeFileSync(tempFile, input.code, 'utf8');

      let cmd = '';
      if (input.language === 'python') cmd = `python .nyx_temp_code.${ext}`;
      else if (input.language === 'javascript') cmd = `node .nyx_temp_code.${ext}`;
      else if (input.language === 'typescript') cmd = `npx tsx .nyx_temp_code.${ext}`;
      else if (input.language === 'sh') cmd = `bash .nyx_temp_code.${ext}`;

      const { child, error } = await TerminalService.spawn(cmd, workspacePath);
      if (error) return `Error: ${error}`;
      if (!child) return `Error: Failed to spawn process.`;

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('close', (code) => {
          try {
            fs.unlinkSync(tempFile);
          } catch {}
          resolve(`Exit code: ${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`);
        });
        child.on('error', (err) => {
          try {
            fs.unlinkSync(tempFile);
          } catch {}
          resolve(`Process error: ${err.message}\nStdout:\n${stdout}\nStderr:\n${stderr}`);
        });
      });
    } catch (err: any) {
      return `Error running code: ${err.message}`;
    }
  },
});

const getEvolutionaryRulesTool = createTool({
  name: 'get_evolutionary_rules',
  description: 'Retrieve learned coding rules and preferences from previous sessions.',
  inputSchema: z.object({}),
  async execute(input) {
    try {
      const rules = agentService.getRules();
      return JSON.stringify(rules);
    } catch (err: any) {
      return `Error getting evolutionary rules: ${err.message}`;
    }
  },
});

const ALL_CLINE_TOOLS = [
  readFileTool,
  writeFileTool,
  runCommandTool,
  searchCodebaseTool,
  webSearchTool,
  validateCodeTool,
  getWorkspaceInfoTool,
  runCodeTool,
  getEvolutionaryRulesTool,
];

// ── Service Execution ─────────────────────────────────────────────────────────

export interface ClineExecuteParams {
  model: string;
  prompt: string;
  history?: any[];
  apiKey?: string;
  gatewayUrls?: Record<string, string>;
  images?: any[];
}

export class ClineService {
  static resolveRealGeminiModel(model: string): string {
    const modelMap: Record<string, string> = {
      'gemma-4-31b-it': 'gemma-4-31b-it',
      'gemma-4-27b-it': 'gemma-4-26b-a4b-it',
      'gemini-3.5-flash': 'gemini-3.5-flash',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-2.5-flash': 'gemini-2.5-flash',
    };
    return modelMap[model] || model;
  }

  /** Whether a Cline SDK error indicates an empty model turn that can be retried. */
  private static isEmptyOutputError(err: any): boolean {
    const msg: string = err?.message || '';
    return (
      msg.includes('model output must contain') ||
      msg.includes('cannot both be empty') ||
      msg.includes('empty content') ||
      msg.includes('no content')
    );
  }

  async executeClineAgent(
    params: ClineExecuteParams,
    onEvent: (event: any) => void
  ): Promise<void> {
    const { model, prompt, apiKey } = params;

    let providerId = 'gemini';
    let modelId = ClineService.resolveRealGeminiModel(model);
    let resolvedApiKey = apiKey || process.env.ANTIGRAVITY_API_KEY || '';

    // Route local offline runner via openai-compatible provider in Cline
    if (model === 'nyx-native' || modelId.startsWith('nyx-native')) {
      providerId = 'openai-compatible';
      modelId = 'qwen2.5-coder-7b'; // default mock identifier
      resolvedApiKey = 'dummy-key';
    }

    logger.info(`[ClineService] Instantiating Agent with provider=${providerId}, model=${modelId}`);

    const systemPrompt = [
      'You are NYX Coder, an elite AI software engineer.',
      'You MUST always respond with either text, or a tool call — never with an empty response.',
      'If you have nothing else to add, write a brief summary of what you did.',
    ].join(' ');

    const agent = new Agent({
      providerId,
      modelId,
      apiKey: resolvedApiKey,
      baseUrl: providerId === 'openai-compatible' ? 'http://127.0.0.1:12345/v1' : undefined,
      tools: ALL_CLINE_TOOLS,
      systemPrompt,
    });

    agent.subscribe((event) => {
      onEvent(event);
    });

    const MAX_RETRIES = 2;
    let lastErr: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await agent.run(prompt);
        return; // success
      } catch (err: any) {
        lastErr = err;
        if (ClineService.isEmptyOutputError(err) && attempt < MAX_RETRIES) {
          logger.warn(
            `[ClineService] Empty model output on attempt ${attempt}, retrying with nudge prompt…`
          );
          // Emit a synthetic thinking event so the client knows we're retrying
          onEvent({ type: 'assistant-text-delta', text: '' });
          // Retry with an explicit nudge appended
          try {
            const nudgedPrompt =
              prompt +
              '\n\n[System: Your previous response was empty. Please respond with at least a brief status update or continue the task.]';
            await agent.run(nudgedPrompt);
            return; // success on retry
          } catch (retryErr: any) {
            lastErr = retryErr;
          }
        } else {
          break;
        }
      }
    }

    // If all retries failed, transform empty-output errors into a friendly message
    if (ClineService.isEmptyOutputError(lastErr)) {
      logger.warn(
        '[ClineService] Model returned empty output after retries, sending fallback message.'
      );
      onEvent({
        type: 'assistant-text-delta',
        text: 'The model returned an empty response. This can happen when the selected model does not support the tool-calling format. Try switching to a different model (e.g., gemini-2.5-flash) or rephrasing your prompt.',
      });
      return;
    }

    logger.error('[ClineService] Agent execution failed after retries:', lastErr);
    throw lastErr;
  }
}
