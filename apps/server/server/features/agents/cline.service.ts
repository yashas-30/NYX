import { Agent, createTool } from '@cline/sdk';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { FilesystemService } from '../nyx/filesystem.service.js';
import { SearchService } from '../nyx/search.service.js';
import { WorkspaceService } from '../nyx/workspace.service.js';
import { AgentService } from '../nyx/agent.service.js';
import { TerminalService } from '../terminal/terminal.service.js';
import { getWorkspaceRoot } from '../../lib/paths.js';
import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sanitizePrompt } from './agents.service.js';
import { Gateway } from '../../lib/gateway.js';

// ── Security: Command Allowlist & Blocklist ───────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  'git', 'npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'python3',
  'cat', 'ls', 'dir', 'grep', 'find', 'echo', 'type', 'pwd',
  'tsc', 'tsx', 'eslint', 'prettier', 'vitest', 'jest',
]);

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s*\//i,
  /rm\s+-rf\s*~/i,
  /del\s+\/[sS]/,
  /curl[^|]*\|\s*bash/i,
  /curl[^|]*\|\s*sh/i,
  /wget[^|]*\|\s*bash/i,
  />\s*\/dev\/(null|sd|hd|zero)/,
  /format\s+c:/i,
  /mkfs/i,
  /:(){ :|:& };:/,  // fork bomb
];

function validateCommand(cmd: string): { valid: boolean; reason?: string } {
  const trimmed = cmd.trim();
  const base = trimmed.split(/\s+/)[0]?.toLowerCase() || '';
  // Strip path prefix (e.g. /usr/bin/node -> node)
  const binary = path.basename(base);

  if (!ALLOWED_COMMANDS.has(binary)) {
    return { valid: false, reason: `Command '${binary}' is not in the allowed list. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}` };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Command contains a blocked pattern: ${pattern}` };
    }
  }
  return { valid: true };
}

/** Guard against path traversal in file tools. Returns resolved safe path or throws. */
function safePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    throw new Error(`Absolute paths are blocked: '${inputPath}'`);
  }
  if (inputPath.split(/[/\\]/).includes('..')) {
    throw new Error(`Path traversal with '..' is blocked: '${inputPath}'`);
  }

  const workspaceRoot = getWorkspaceRoot();
  const resolved = path.resolve(workspaceRoot, inputPath);

  // Symlink check
  try {
    const realPath = fs.realpathSync(resolved);
    if (!realPath.startsWith(workspaceRoot)) {
      throw new Error(`Symlink targets outside workspace: '${inputPath}'`);
    }
  } catch (err: any) {
    // If target file doesn't exist, realpathSync might fail. In that case, check the parent directory
    let current = resolved;
    while (current !== workspaceRoot && current !== path.dirname(current)) {
      try {
        if (fs.existsSync(current)) {
          const realCurrent = fs.realpathSync(current);
          if (!realCurrent.startsWith(workspaceRoot)) {
            throw new Error(`Path resolves outside workspace via symlink: '${inputPath}'`);
          }
          break;
        }
      } catch {}
      current = path.dirname(current);
    }
  }

  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error(`Path traversal blocked: '${inputPath}' resolves outside workspace`);
  }
  return resolved;
}

/** Creates a git checkpoint commit before destructive agent edits. Silent if git not initialized. */
export function checkpointWorkspace(workspacePath: string): void {
  try {
    execSync('git add -A && git commit -m "NYX: auto-checkpoint before agent edit" --allow-empty', {
      cwd: workspacePath,
      stdio: 'ignore',
      timeout: 10_000,
    });
    logger.info('[ClineService] Git checkpoint created');
  } catch {
    // Git not initialized, nothing to commit, or commit failed — safe to continue
  }
}

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
  async execute(input: any) {
    try {
      safePath(input.path); // Throws if path traversal detected
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
  async execute(input: any) {
    try {
      safePath(input.path); // Throws if path traversal detected
      const workspacePath = getWorkspaceRoot();
      checkpointWorkspace(workspacePath);
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
  async execute(input: any) {
    const { command, cwd } = input;

    const validation = validateCommand(command);
    if (!validation.valid) {
      logger.warn(`[ClineService] Blocked command: ${command} — ${validation.reason}`);
      return `Error: Command blocked by security policy. ${validation.reason}`;
    }

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
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolve(`Error: Command timed out after 60 seconds.\nStdout:\n${stdout}\nStderr:\n${stderr}`);
      }, 60_000);
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve(`Exit code: ${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`);
      });
      child.on('error', (err) => {
        clearTimeout(timeoutId);
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
  async execute(input: any) {
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
  async execute(input: any) {
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
  async execute(input: any) {
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
  async execute(input: any) {
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
  async execute(input: any) {
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
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          try { fs.unlinkSync(tempFile); } catch {}
          resolve(`Error: Code execution timed out after 30 seconds.\nStdout:\n${stdout}\nStderr:\n${stderr}`);
        }, 30_000);
        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('close', (code) => {
          clearTimeout(timeoutId);
          try { fs.unlinkSync(tempFile); } catch {}
          resolve(`Exit code: ${code}\nStdout:\n${stdout}\nStderr:\n${stderr}`);
        });
        child.on('error', (err) => {
          clearTimeout(timeoutId);
          try { fs.unlinkSync(tempFile); } catch {}
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
  async execute(input: any) {
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
      'gemini-3-flash-preview': 'gemini-3-flash-preview',
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
      'gemini-flash-latest': 'gemini-flash-latest',
      'gemini-pro-latest': 'gemini-pro-latest',
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

    // Sanitization (Phase 4.3)
    const sanitization = sanitizePrompt(prompt);
    if (sanitization.blocked) {
      onEvent({
        type: 'assistant-text-delta',
        text: sanitization.clean,
      });
      return;
    }

    let providerId = 'gemini';
    let modelId = ClineService.resolveRealGeminiModel(model);
    let resolvedApiKey = apiKey || Gateway.getActiveKey('gemini', undefined) || env.ANTIGRAVITY_API_KEY || '';

    // Route local offline runner via openai-compatible provider in Cline
    if (model === 'ollama' || model === 'lmstudio' || modelId.startsWith('ollama') || modelId.startsWith('lmstudio')) {
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

    agent.subscribe((event: any) => {
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
