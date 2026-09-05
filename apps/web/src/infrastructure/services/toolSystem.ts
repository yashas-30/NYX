/**
 * @file src/infrastructure/services/toolSystem.ts
 * @description Advanced Tool Registry and Executor for NYX autonomous agent.
 *              Supports streaming, parallel execution, reasoning blocks,
 *              and structured tool results like Claude/Kimi.
 */

import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useAppStore } from '@src/stores/useAppStore';
import { getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { WorkspaceIntelligence } from './workspaceIntelligence';
import { invoke, Channel } from '@tauri-apps/api/core';
import {
  searchTopicImages,
  searchTopicVideos,
  generateVisualAsset,
  ExtractedImage,
  ExtractedVideo,
} from '@src/core/services/mediaEngine';

function safeEvaluateMath(expr: string): number {
  const sanitized = expr.replace(/[^0-9+\-*/().,%^eE\sMath.sqrtcospitannlgabsminmax]/g, '');
  const converted = sanitized
    .replace(/\^/g, '**')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\blog\b/g, 'Math.log10')
    .replace(/\bln\b/g, 'Math.log');
  const result = Function(`"use strict"; return (${converted})`)();
  if (typeof result !== 'number' || isNaN(result))
    throw new Error('Invalid mathematical calculation');
  return result;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  enum?: any[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
}

/** Represents a single tool call requested by the model */
export interface ToolCall {
  id: string; // Unique call ID (e.g., "call_abc123")
  name: string; // Tool name
  arguments: Record<string, any>; // Parsed JSON arguments
  rawArguments: string; // Raw JSON string for debugging
}

/** Represents the result of executing a tool */
export interface ToolResult {
  callId: string;
  name: string;
  status: 'success' | 'error' | 'cancelled';
  content: any; // The actual result data
  metadata: {
    durationMs: number;
    timestamp: string;
    retryCount: number;
    truncated?: boolean; // If result was too long and truncated
    tokenCount?: number; // Approximate tokens in result
  };
  error?: {
    message: string;
    code: string;
    recoverable: boolean;
  };
}

/** Streaming chunk types for real-time tool execution */
export type ToolStreamChunk =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call_start'; callId: string; name: string }
  | { type: 'tool_call_delta'; callId: string; argumentsChunk: string }
  | { type: 'tool_call_complete'; callId: string; arguments: Record<string, any> }
  | { type: 'tool_result_start'; callId: string }
  | { type: 'tool_result_delta'; callId: string; contentChunk: string }
  | { type: 'tool_result_complete'; callId: string; result: ToolResult }
  | { type: 'error'; callId?: string; message: string; code: string };

/** Callback for streaming updates */
export type ToolStreamCallback = (chunk: ToolStreamChunk) => void | Promise<void>;

/** Configuration for tool execution */
export interface ToolExecutionConfig {
  signal?: AbortSignal;
  onStream?: ToolStreamCallback;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  maxResultTokens?: number; // Auto-truncate if result exceeds this
  allowParallel?: boolean; // Execute multiple tools concurrently
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

class SchemaValidator {
  static validate(value: any, schema: JSONSchemaProperty, path = ''): string[] {
    const errors: string[] = [];

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path}: must be one of [${schema.enum.join(', ')}]`);
    }

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') errors.push(`${path}: expected string, got ${typeof value}`);
        break;
      case 'number':
        if (typeof value !== 'number') errors.push(`${path}: expected number, got ${typeof value}`);
        break;
      case 'integer':
        if (!Number.isInteger(value)) errors.push(`${path}: expected integer, got ${value}`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean')
          errors.push(`${path}: expected boolean, got ${typeof value}`);
        break;
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${path}: expected array, got ${typeof value}`);
        } else if (schema.items) {
          value.forEach((item, i) => {
            errors.push(...this.validate(item, schema.items!, `${path}[${i}]`));
          });
        }
        break;
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`${path}: expected object, got ${typeof value}`);
        } else if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (schema.required?.includes(key) && !(key in value)) {
              errors.push(`${path}.${key}: required property missing`);
            } else if (key in value) {
              errors.push(...this.validate(value[key], propSchema, `${path}.${key}`));
            }
          }
        }
        break;
    }

    return errors;
  }

  static validateToolCall(tool: ToolDefinition, args: Record<string, any>): string[] {
    return this.validate(
      args,
      {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
      ''
    );
  }
}

// ============================================================================
// SECURITY
// ============================================================================

function validatePath(pathStr?: string): void {
  if (!pathStr) return;
  const normalized = pathStr.replace(/\\/g, '/');
  if (normalized.includes('../') || normalized.startsWith('..')) {
    throw new Error(`SECURITY ERROR: Path traversal detected in "${pathStr}"`);
  }
  if (/^\/(proc|sys|dev|etc|root|var\/log)/i.test(normalized)) {
    throw new Error(`SECURITY ERROR: Access to system paths is not allowed: "${pathStr}"`);
  }
}

function sanitizeCommand(command: string): void {
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,
    /mkfs\./,
    /dd\s+if=.*of=\/dev\/[sh]d/,
    /:(){ :|:& };:/, // Fork bomb
    /> \/dev\/null.*&/, // Background redirect tricks
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      throw new Error(`SECURITY ERROR: Dangerous command pattern detected: "${command}"`);
    }
  }
}

// ============================================================================
// RESULT PROCESSING
// ============================================================================

class ResultProcessor {
  static readonly DEFAULT_MAX_TOKENS = 8000;

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  static truncateIfNeeded(content: any, maxTokens?: number): { content: any; truncated: boolean } {
    const limit = maxTokens ?? this.DEFAULT_MAX_TOKENS;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    const tokens = this.estimateTokens(str);

    if (tokens <= limit) return { content, truncated: false };

    const maxChars = limit * 4;
    const truncated = str.substring(0, maxChars) + '\n\n[... Result truncated due to length ...]';
    return { content: truncated, truncated: true };
  }

  static formatForModel(result: ToolResult): any {
    if (result.status === 'error') {
      return {
        tool_call_id: result.callId,
        role: 'tool',
        name: result.name,
        content: `[ERROR ${result.error?.code}]: ${result.error?.message}`,
      };
    }
    return {
      tool_call_id: result.callId,
      role: 'tool',
      name: result.name,
      content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
    };
  }
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the workspace, optionally between specific lines. Use this to examine code, configs, or documentation.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file in the workspace (e.g., "src/utils/helpers.ts").',
        },
        startLine: {
          type: 'integer',
          description: 'Optional 1-based start line (inclusive). Omit to read from beginning.',
        },
        endLine: {
          type: 'integer',
          description: 'Optional 1-based end line (inclusive). Omit to read to end.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Update the content of an existing file with a complete rewrite. Use write_file for new files instead.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file to modify.',
        },
        content: {
          type: 'string',
          description: 'The complete new content for the file. Must be the full file, not a diff.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create a new file in the workspace. Fails if file already exists unless overwrite is true.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path where the file should be created.',
        },
        content: {
          type: 'string',
          description: 'The complete file contents.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Whether to overwrite if file exists. Default false.',
          default: false,
        },
      },
      required: ['path', 'content'],
    },
  },

  {
    name: 'run_terminal',
    description:
      'Execute a shell command in the terminal sandbox. Use with caution. Prefer read_file over cat/grep when possible.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'Optional relative working directory for the command.',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds. Default 30000.',
          default: 30000,
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web for API documentation, libraries, error solutions, or general knowledge.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The web search query.',
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional fallback array of search queries.',
        },
        numResults: {
          type: 'integer',
          description: 'Number of results to fetch.',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'deep_research',
    description:
      'Perform multi-angle deep technical research, benchmark comparison, and information extraction across web sources.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The technical subject, system architecture, or question to research comprehensively.',
        },
        numResults: {
          type: 'integer',
          description: 'Number of search result references to gather (default: 8).',
          default: 8,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_images',
    description:
      'Search the web for high-resolution images, photos, illustrations, or diagrams. Returns image titles, direct URLs, and source attribution.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query describing the image/visual subject to look for.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of images to return (1-6, default 3).',
          default: 3,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_videos',
    description:
      'Search YouTube and web platforms for relevant video tutorials, explanations, demonstrations, or clips.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The topic, keyword, or title to find videos for.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of videos to return (1-4, default 2).',
          default: 2,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an AI image from a descriptive text prompt.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed prompt describing the image to generate.',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:2'],
          description: 'Aspect ratio of the generated image (default: "1:1").',
          default: '1:1',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'calculate',
    description:
      'Evaluate a mathematical expression accurately (arithmetic, percentages, powers, trigonometry).',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to compute, e.g. "(144 * 12) + (50 * 0.15)".',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'fetch_page_content',
    description: 'Fetch and extract clean readable text from a webpage URL.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch content from.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'grep_search',
    description: 'Search recursively in the workspace for files containing a specific pattern.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path in workspace to search in. Defaults to workspace root.',
        },
        query: {
          type: 'string',
          description: 'Text pattern to search for.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a specific path. Use to explore project structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to inspect. Defaults to workspace root.',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively.',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'git_diff',
    description: 'Inspect uncommitted changes or diff of a specific file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional relative path to show diff for.',
        },
        staged: {
          type: 'boolean',
          description: 'Show staged changes only.',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'git_status',
    description: 'Show current git status including modified, untracked, and staged files.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'start_subagent',
    description:
      'Spawn and delegate a complex or isolated subtask to a specialized child subagent with its own independent context window and execution lifecycle.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Detailed instructions, prompt, or goal for the child subagent to execute.',
        },
        subagent_name: {
          type: 'string',
          description:
            'Optional name of a registered subagent (e.g., "code_reviewer"), or omit for dynamic self-cloning.',
        },
        context: {
          type: 'string',
          description: 'Optional background context or file content for the subagent.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'read_url_content',
    description: 'Fetch and extract text content from a web URL.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The HTTP or HTTPS URL to fetch content from.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'ask_question',
    description: 'Prompt user with a question or decision options.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user.',
        },
        options: {
          type: 'array',
          description: 'Optional selectable options.',
          items: {
            type: 'string',
          },
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'finish',
    description:
      'Signal that the autonomous agent has completed all tasks and return final output.',
    parameters: {
      type: 'object',
      properties: {
        output: {
          type: 'string',
          description: 'Final summary or synthesized response.',
        },
      },
      required: ['output'],
    },
  },
];

// ============================================================================
// TOOL EXECUTOR
// ============================================================================

export class ToolExecutor {
  private static instance: ToolExecutor;
  private registry: Map<string, ToolDefinition>;

  private constructor() {
    this.registry = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));
  }

  static getInstance(): ToolExecutor {
    if (!ToolExecutor.instance) {
      ToolExecutor.instance = new ToolExecutor();
    }
    return ToolExecutor.instance;
  }

  /** Register a custom tool at runtime */
  registerTool(definition: ToolDefinition): void {
    this.registry.set(definition.name, definition);
  }

  /** Get tool definition by name */
  getTool(name: string): ToolDefinition | undefined {
    return this.registry.get(name);
  }

  /** Validate and parse raw tool calls from model output */
  parseToolCalls(rawCalls: Array<{ id: string; name: string; arguments: string }>): ToolCall[] {
    return rawCalls.map((raw) => {
      const tool = this.registry.get(raw.name);
      if (!tool) {
        throw new Error(`Unknown tool: ${raw.name}`);
      }

      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(raw.arguments);
      } catch (e: any) {
        throw new Error(`Invalid JSON arguments for tool ${raw.name}: ${e}`);
      }

      const validationErrors = SchemaValidator.validateToolCall(tool, parsed);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed for ${raw.name}: ${validationErrors.join('; ')}`);
      }

      return {
        id: raw.id,
        name: raw.name,
        arguments: parsed,
        rawArguments: raw.arguments,
      };
    });
  }

  /** Execute a single tool with full error handling, retries, and streaming */
  async executeSingle(call: ToolCall, config: ToolExecutionConfig = {}): Promise<ToolResult> {
    const startTime = Date.now();
    const maxRetries = config.maxRetries ?? 2;
    let retryCount = 0;
    let lastError: Error | undefined;

    // Emit start event
    await config.onStream?.({ type: 'tool_call_start', callId: call.id, name: call.name });

    while (retryCount <= maxRetries) {
      try {
        const result = await this.executeToolInternal(call, config);
        const processed = ResultProcessor.truncateIfNeeded(result, config.maxResultTokens);

        const toolResult: ToolResult = {
          callId: call.id,
          name: call.name,
          status: 'success',
          content: processed.content,
          metadata: {
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            retryCount,
            truncated: processed.truncated,
            tokenCount: ResultProcessor.estimateTokens(
              typeof processed.content === 'string'
                ? processed.content
                : JSON.stringify(processed.content)
            ),
          },
        };

        await config.onStream?.({
          type: 'tool_result_complete',
          callId: call.id,
          result: toolResult,
        });
        return toolResult;
      } catch (error: any) {
        lastError = error as Error;
        retryCount++;

        const recoverable = this.isRecoverableError(error as Error);
        if (!recoverable || retryCount > maxRetries) break;

        // Exponential backoff
        const delay = (config.retryDelayMs ?? 1000) * Math.pow(2, retryCount - 1);
        await this.sleep(delay);
      }
    }

    // Final error result
    const errorResult: ToolResult = {
      callId: call.id,
      name: call.name,
      status: 'error',
      content: null,
      metadata: {
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        retryCount,
      },
      error: {
        message: lastError?.message ?? 'Unknown error',
        code: this.classifyError(lastError),
        recoverable: false,
      },
    };

    await config.onStream?.({ type: 'tool_result_complete', callId: call.id, result: errorResult });
    return errorResult;
  }

  /** Execute multiple tools in parallel (like Claude/Kimi multi-tool calls) */
  async executeParallel(
    calls: ToolCall[],
    config: ToolExecutionConfig = {}
  ): Promise<ToolResult[]> {
    if (!config.allowParallel) {
      // Sequential execution
      const results: ToolResult[] = [];
      for (const call of calls) {
        if (config.signal?.aborted) {
          results.push(this.createCancelledResult(call));
          continue;
        }
        results.push(await this.executeSingle(call, config));
      }
      return results;
    }

    // Parallel execution with individual error isolation
    const promises = calls.map(async (call) => {
      if (config.signal?.aborted) return this.createCancelledResult(call);
      return this.executeSingle(call, config);
    });

    return Promise.all(promises);
  }

  /** Main entry point: execute parsed tool calls */
  async execute(calls: ToolCall[], config: ToolExecutionConfig = {}): Promise<ToolResult[]> {
    return this.executeParallel(calls, config);
  }

  // -------------------------------------------------------------------------
  // Static execute method for 100% backward compatibility
  // -------------------------------------------------------------------------
  static async execute(
    toolName: string,
    params: Record<string, any>,
    signal?: AbortSignal
  ): Promise<any> {
    const executor = ToolExecutor.getInstance();
    const call: ToolCall = {
      id: `legacy_${Date.now()}`,
      name: toolName,
      arguments: params,
      rawArguments: JSON.stringify(params),
    };
    const result = await executor.executeSingle(call, { signal });
    if (result.status === 'error') throw new Error(result.error?.message);
    return result.content;
  }

  // ==========================================================================
  // INTERNAL TOOL IMPLEMENTATIONS
  // ==========================================================================

  private async executeToolInternal(call: ToolCall, config: ToolExecutionConfig): Promise<any> {
    const { signal } = config;
    const params = call.arguments || {};

    let toolName = (call.name || '')
      .replace(/^default_api:/i, '')
      .replace(/^antigravity:/i, '')
      .replace(/^gemini:/i, '')
      .trim();

    if (toolName === 'google_search' || toolName === 'search_web') toolName = 'web_search';
    if (toolName === 'code_execution' || toolName === 'run_command') toolName = 'run_terminal';
    if (toolName === 'file_search' || toolName === 'search_directory') toolName = 'grep_search';
    if (toolName === 'view_file') toolName = 'read_file';
    if (toolName === 'create_file') toolName = 'write_file';
    if (toolName === 'find_file') toolName = 'find_by_name';
    if (toolName === 'list_dir') toolName = 'list_directory';
    if (toolName === 'generate_image') toolName = 'generate_visual_asset';

    switch (toolName) {
      case 'read_file': {
        const filePath =
          params.path ||
          params.filePath ||
          params.file_path ||
          params.filename ||
          params.file ||
          params.target_file ||
          params.uri ||
          '';
        if (!filePath) throw new Error('Missing file path for read_file');
        validatePath(filePath);
        WorkspaceIntelligence.trackOpenFile(filePath);
        try {
          const content: string = await invoke('fs_read_file', { path: filePath });
          if (params.startLine && params.endLine) {
            const lines = content.split('\n');
            return lines.slice(params.startLine - 1, params.endLine).join('\n');
          }
          return content;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Failed to read file');
        }
      }

      case 'edit_file': {
        const filePath =
          params.path ||
          params.filePath ||
          params.file_path ||
          params.filename ||
          params.file ||
          params.target_file ||
          '';
        if (!filePath) throw new Error('Missing file path for edit_file');
        const content =
          params.content ??
          params.text ??
          params.code ??
          params.contents ??
          params.data ??
          params.body ??
          params.replacement ??
          '';
        validatePath(filePath);
        WorkspaceIntelligence.trackOpenFile(filePath);
        try {
          await invoke('fs_write_file', {
            path: filePath,
            content,
            overwrite: true,
          });
          return `Successfully edited file: ${filePath}`;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Failed to edit file');
        }
      }

      case 'write_file': {
        const filePath =
          params.path ||
          params.filePath ||
          params.file_path ||
          params.filename ||
          params.file ||
          params.target_file ||
          '';
        if (!filePath) throw new Error('Missing file path for write_file');
        const content =
          params.content ??
          params.text ??
          params.code ??
          params.contents ??
          params.data ??
          params.body ??
          '';
        validatePath(filePath);
        WorkspaceIntelligence.trackOpenFile(filePath);
        try {
          await invoke('fs_write_file', {
            path: filePath,
            content,
            overwrite: params.overwrite ?? false,
          });
          return `Successfully created file: ${filePath}`;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Failed to write file');
        }
      }

      case 'run_terminal': {
        const command =
          params.command ||
          params.cmd ||
          params.script ||
          params.code ||
          params.terminal_command ||
          params.shell_command ||
          '';
        if (!command) throw new Error('Missing command for run_terminal');
        const cwd = params.cwd || params.directory || params.path || '';
        if (cwd) validatePath(cwd);
        sanitizeCommand(command);
        try {
          const result: any = await invoke('execute_command', {
            command,
            cwd: cwd || '',
          });
          return {
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            exitCode: result.exitCode ?? 0,
          };
        } catch (e: any) {
          throw new Error(e?.message || e || `Command execution failed`);
        }
      }

      case 'web_search': {
        const q =
          params.query ||
          params.q ||
          params.search_query ||
          params.prompt ||
          params.input ||
          params.topic ||
          (params.queries && params.queries.length > 0 ? params.queries[0] : '');
        if (!q) throw new Error('Missing query parameter for web_search');
        try {
          const storeState = useNyxStore.getState();
          const searchProvider = storeState.searchProvider || 'duckduckgo';
          const apiKey = storeState.apiKeys[searchProvider] || '';
          const result: string = await invoke('search_web_command', {
            query: q,
            numResults: params.numResults ?? params.limit ?? 5,
            searchProvider: searchProvider,
            apiKey,
          });
          return result;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Web search failed');
        }
      }

      case 'deep_research': {
        const q =
          params.query ||
          params.prompt ||
          params.topic ||
          params.subject ||
          params.q ||
          (params.queries && params.queries.length > 0 ? params.queries[0] : '');
        if (!q) throw new Error('Missing query parameter for deep_research');

        const appKeys = useAppStore.getState().apiKeys || ({} as any);
        const nyxKeys = useNyxStore.getState().apiKeys || {};
        const geminiKey =
          getEffectiveApiKey('gemini', { ...appKeys, ...nyxKeys }) ||
          appKeys['gemini'] ||
          nyxKeys['gemini'] ||
          '';

        // 1. First Attempt: Google AI Studio Deep Research via Gemini API
        if (geminiKey && geminiKey.trim().length > 0) {
          try {
            // Attempt A: Interactions API with deep-research agent
            const interactionRes = await fetch(
              'https://generativelanguage.googleapis.com/v1beta/interactions',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': geminiKey,
                },
                body: JSON.stringify({
                  agent: 'deep-research-preview-04-2026',
                  input: q,
                  agent_config: {
                    type: 'deep-research',
                    thinking_summaries: 'auto',
                    visualization: 'auto',
                  },
                  tools: [{ type: 'google_search' }, { type: 'url_context' }],
                }),
              }
            ).catch(() => null);

            if (interactionRes && interactionRes.ok) {
              const interactionData = await interactionRes.json();
              if (interactionData.output_text) {
                return interactionData.output_text;
              }
            }

            // Attempt B: Google AI Studio Gemini 3.7 Pro Preview with Google Search Grounding & Deep Thinking
            const genRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text: `Conduct an exhaustive technical deep research investigation, comparative benchmark analysis, and fact synthesis on the following topic:\n\n${q}`,
                        },
                      ],
                    },
                  ],
                  systemInstruction: {
                    parts: [
                      {
                        text: 'You are the Google Deep Research Engine. Output a comprehensive, structured research report with an Executive Summary, Key Technical Findings, In-Depth Architectural Analysis, Data & Benchmark Tables, and Verified Source Citations.',
                      },
                    ],
                  },
                  tools: [{ googleSearch: {} }],
                  generationConfig: {
                    thinkingConfig: { thinkingBudget: -1 },
                  },
                }),
              }
            ).catch(() => null);

            if (genRes && genRes.ok) {
              const genData = await genRes.json();
              const firstCand = genData.candidates?.[0];
              let reportText = '';
              if (firstCand?.content?.parts) {
                for (const p of firstCand.content.parts) {
                  if (p.text && !p.thought) reportText += p.text;
                }
              }

              // Extract citations from groundingMetadata
              const grounding = firstCand?.groundingMetadata;
              const citations: string[] = [];
              if (grounding?.groundingChunks) {
                for (const chunk of grounding.groundingChunks) {
                  if (chunk.web?.uri) {
                    citations.push(`- [${chunk.web.title || 'Source'}](${chunk.web.uri})`);
                  }
                }
              }

              if (reportText) {
                const citationBlock =
                  citations.length > 0
                    ? `\n\n### Discovered Sources & Verified Citations\n${citations.join('\n')}`
                    : '';
                return `${reportText}${citationBlock}`;
              }
            }
          } catch (geminiResearchErr) {
            console.warn(
              '[toolSystem:deep_research] Google AI Studio call warning:',
              geminiResearchErr
            );
          }
        }

        // 2. Fallback: Local / Tauri Deep Research DAG
        try {
          const storeState = useNyxStore.getState();
          const searchProvider = storeState.searchProvider || 'duckduckgo';
          const apiKey = storeState.apiKeys[searchProvider] || '';
          const onProgress = new Channel<any>();

          const researchResult: any = await invoke('start_deep_research', {
            query: {
              prompt: q,
              depth_limit: params.numResults ?? params.limit ?? 8,
              provider: searchProvider,
              api_key: apiKey,
            },
            onProgress,
          }).catch((err) => {
            console.warn(
              '[toolSystem:deep_research] start_deep_research failed, falling back to search_web_command:',
              err
            );
            return null;
          });

          if (researchResult && typeof researchResult === 'object') {
            const report = researchResult.report || '';
            const sources = (researchResult.sources || [])
              .map(
                (s: any, idx: number) =>
                  `[${idx + 1}] [${s.title || 'Source'}](${s.url}): ${s.snippet || ''}`
              )
              .join('\n\n');
            return `${report}\n\n### Discovered Sources & Citations\n${sources}`;
          }

          const fallbackResult: string = await invoke('search_web_command', {
            query: q,
            numResults: params.numResults ?? 8,
            searchProvider,
            apiKey,
          });
          return fallbackResult || 'Deep research completed with no external findings.';
        } catch (e: any) {
          throw new Error(e?.message || e || 'Deep research failed');
        }
      }

      case 'list_directory': {
        const dirPath =
          params.path || params.dirPath || params.directory || params.dir || params.folder || '.';
        validatePath(dirPath);
        try {
          const files: any = await invoke('fs_list_dir', { dirPath });
          return files;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Failed to list directory');
        }
      }

      case 'search_images': {
        const q = (params.query || params.prompt || params.topic || params.q || '').trim();
        if (!q) throw new Error('Missing search query for search_images');
        const limit = Math.min(Math.max(Number(params.limit || params.numResults) || 3, 1), 6);
        try {
          const images: ExtractedImage[] = await searchTopicImages(q, limit);
          return {
            query: q,
            count: images.length,
            images: images.map((img) => ({
              title: img.title,
              url: img.url,
              source: img.source || 'Web Search',
              thumbnailUrl: img.thumbnailUrl || img.url,
            })),
          };
        } catch (e: any) {
          throw new Error(e?.message || e || 'Image search failed');
        }
      }

      case 'search_videos': {
        const q = (params.query || params.prompt || params.topic || params.q || '').trim();
        if (!q) throw new Error('Missing search query for search_videos');
        const limit = Math.min(Math.max(Number(params.limit || params.numResults) || 2, 1), 4);
        try {
          const videos: ExtractedVideo[] = await searchTopicVideos(q, limit);
          return {
            query: q,
            count: videos.length,
            videos: videos.map((vid) => ({
              title: vid.title,
              url: vid.url,
              previewUrl: vid.previewUrl,
              duration: vid.duration,
              channel: vid.author,
              source: vid.source,
            })),
          };
        } catch (e: any) {
          throw new Error(e?.message || e || 'Video search failed');
        }
      }

      case 'generate_image': {
        const prompt = (
          params.prompt ||
          params.text ||
          params.description ||
          params.image_prompt ||
          ''
        ).trim();
        if (!prompt) throw new Error('Missing prompt for generate_image');
        const ar =
          params.aspect_ratio === '16:9' ||
          params.aspect_ratio === '9:16' ||
          params.aspect_ratio === '4:3'
            ? params.aspect_ratio
            : '1:1';
        try {
          const asset = await generateVisualAsset(prompt, ar);
          return {
            prompt,
            imageUrl: asset.imageUrl,
            source: asset.engine,
            status: 'success',
          };
        } catch (e: any) {
          throw new Error(e?.message || e || 'Image generation failed');
        }
      }

      case 'calculate': {
        const expr = (
          params.expression ||
          params.expr ||
          params.formula ||
          params.math ||
          params.equation ||
          ''
        ).trim();
        if (!expr) throw new Error('Missing expression for calculate');
        try {
          const val = safeEvaluateMath(expr);
          return {
            expression: expr,
            result: val,
          };
        } catch (e: any) {
          throw new Error(`Calculation error: ${e?.message || e}`);
        }
      }

      case 'fetch_page_content': {
        const url = (params.url || params.uri || params.link || params.webpage || '').trim();
        if (!url) throw new Error('Missing URL for fetch_page_content');
        try {
          const text: string = await invoke('fetch_page_content', { url });
          return text;
        } catch (e: any) {
          // Fallback to fetch
          try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = await resp.text();
            const cleanText = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            return cleanText.substring(0, 10000);
          } catch (inner) {
            throw new Error(`Failed to fetch page: ${e || inner}`);
          }
        }
      }

      case 'grep_search': {
        const path = params.path || params.dirPath || params.directory || '.';
        validatePath(path);
        const query = (
          params.query ||
          params.pattern ||
          params.search ||
          params.term ||
          params.q ||
          ''
        ).trim();
        if (!query) throw new Error('Missing query for grep_search');
        try {
          const results: string = await invoke('grep_workspace', { path, query });
          return results;
        } catch (e: any) {
          return `No matches or grep failed: ${e?.message || e}`;
        }
      }

      case 'git_diff': {
        const path = params.path || '.';
        validatePath(path);
        try {
          const result: any = await invoke('execute_command', {
            command: 'git diff',
            cwd: path,
          });
          return result.stdout;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Failed to fetch git diff');
        }
      }

      case 'git_status': {
        try {
          const result: any = await invoke('execute_command', {
            command: 'git status',
            cwd: '.',
          });
          return result.stdout;
        } catch (e: any) {
          throw new Error(e?.message || e || 'Failed to fetch git status');
        }
      }

      case 'start_subagent': {
        const task = params.task || params.prompt || params.instructions || '';
        if (!task) throw new Error('Missing task parameter for start_subagent');
        const subagentName = params.subagent_name || params.name || params.role;
        const context = params.context || '';

        try {
          const { antigravityAgent } = await import('@src/core/agents/antigravityAgent');
          const subResult = await antigravityAgent.runAgentLoop({
            prompt: context ? `Context:\n${context}\n\nTask:\n${task}` : task,
            maxIterations: 5,
          });

          return {
            subagent: subagentName || 'dynamic_clone',
            status: subResult.status,
            output: subResult.outputText,
            reasoning: subResult.reasoning,
            steps_count: subResult.steps.length,
          };
        } catch (subErr: any) {
          throw new Error(`Subagent delegation failed: ${subErr?.message || subErr}`);
        }
      }

      case 'read_url_content': {
        const url = params.url || params.Url || params.uri || params.link;
        if (!url) throw new Error('Missing url parameter for read_url_content');
        try {
          const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const html = await resp.text();
          const cleanText = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return cleanText.length > 8000
            ? cleanText.substring(0, 8000) + '\n...[truncated]'
            : cleanText;
        } catch (e: any) {
          throw new Error(`Failed to read URL ${url}: ${e?.message || e}`);
        }
      }

      case 'ask_question': {
        const question = params.question || params.prompt || '';
        return {
          question,
          options: params.options || [],
          status: 'question_presented',
        };
      }

      case 'finish': {
        const output =
          params.output || params.response || params.content || 'Task completed successfully.';
        return { status: 'finished', output };
      }

      default:
        return `Unsupported or simulated tool '${call.name}'. Action acknowledged.`;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private createCancelledResult(call: ToolCall): ToolResult {
    return {
      callId: call.id,
      name: call.name,
      status: 'cancelled',
      content: null,
      metadata: {
        durationMs: 0,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      },
      error: {
        message: 'Execution cancelled by user',
        code: 'CANCELLED',
        recoverable: false,
      },
    };
  }

  private isRecoverableError(error: Error): boolean {
    const recoverableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'NETWORK_ERROR'];
    const code = (error as any).code;
    return recoverableCodes.includes(code) || error.message.includes('timeout');
  }

  private classifyError(error: Error | undefined): string {
    if (!error) return 'UNKNOWN';
    if (error.message.includes('SECURITY')) return 'SECURITY_VIOLATION';
    if (error.message.includes('timeout') || (error as any).code === 'ETIMEDOUT') return 'TIMEOUT';
    if (error.message.includes('not found') || error.message.includes('404')) return 'NOT_FOUND';
    if (error.message.includes('permission') || error.message.includes('403'))
      return 'PERMISSION_DENIED';
    return 'EXECUTION_ERROR';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// CONVENIENCE EXPORTS (backward compatible)
// ============================================================================

/** Backward-compatible single tool execution */
export async function executeTool(
  toolName: string,
  params: Record<string, any>,
  signal?: AbortSignal
): Promise<any> {
  return ToolExecutor.execute(toolName, params, signal);
}

/** Export singleton for direct use */
export const toolExecutor = ToolExecutor.getInstance();
