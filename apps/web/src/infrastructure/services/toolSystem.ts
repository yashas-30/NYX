/**
 * @file src/infrastructure/services/toolSystem.ts
 * @description Advanced Tool Registry and Executor for NYX autonomous agent.
 *              Supports streaming, parallel execution, reasoning blocks,
 *              and structured tool results like Claude/Kimi.
 */

import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { WorkspaceIntelligence } from './workspaceIntelligence';

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
    name: 'view_image',
    description: 'View and analyze an image file in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the image file.',
        },
      },
      required: ['path'],
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
    const params = call.arguments;

    switch (call.name) {
      case 'read_file': {
        validatePath(params.path);
        WorkspaceIntelligence.trackOpenFile(params.path);
        const res = await fetchWithAuth('/api/v1/nyx/read-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            startLine: params.startLine,
            endLine: params.endLine,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to read file');
        return data.content;
      }

      // fallow-ignore-next-line code-duplication
      case 'edit_file': {
        validatePath(params.path);
        WorkspaceIntelligence.trackOpenFile(params.path);
        const res = await fetchWithAuth('/api/v1/nyx/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            content: params.content,
            overwrite: true,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to edit file');
        return `Successfully edited file: ${params.path}`;
      }

      // fallow-ignore-next-line code-duplication
      case 'write_file': {
        validatePath(params.path);
        WorkspaceIntelligence.trackOpenFile(params.path);
        const res = await fetchWithAuth('/api/v1/nyx/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            content: params.content,
            overwrite: params.overwrite ?? false,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to write file');
        return `Successfully created file: ${params.path}`;
      }



      case 'run_terminal': {
        validatePath(params.cwd);
        sanitizeCommand(params.command);
        const res = await fetchWithAuth('/api/v1/terminal/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: params.command,
            cwd: params.cwd,
            timeout: params.timeout ?? 30000,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Command failed: ${data.stderr}`);
        }
        return {
          stdout: data.stdout,
          stderr: data.stderr,
          exitCode: data.exitCode ?? 0,
        };
      }

      case 'web_search': {
        const res = await fetchWithAuth('/api/v1/nyx/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: params.query,
            numResults: params.numResults ?? 5,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Web search failed');
        return data.results;
      }

      case 'list_directory': {
        validatePath(params.path);
        const res = await fetchWithAuth('/api/v1/nyx/list-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dirPath: params.path,
            recursive: params.recursive ?? false,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to list directory');
        return data.files;
      }

      case 'git_diff': {
        validatePath(params.path);
        const res = await fetchWithAuth('/api/v1/nyx/git-diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: params.path,
            staged: params.staged ?? false,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch git diff');
        return data.diff;
      }

      case 'git_status': {
        const res = await fetchWithAuth('/api/v1/nyx/git-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch git status');
        return data.status;
      }

      case 'view_image': {
        validatePath(params.path);
        const res = await fetchWithAuth('/api/v1/nyx/view-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: params.path }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to view image');
        return data.description || data.content;
      }

      default:
        throw new Error(`Unsupported tool: ${call.name}`);
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
