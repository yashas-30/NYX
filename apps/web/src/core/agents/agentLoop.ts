/**
 * @file src/core/agents/agentLoop.ts
 * @description Fix 9: Agentic tool execution loop.
 *
 * This is the single biggest quality gap between NYX and Claude/ChatGPT.
 * The pattern is:
 *
 *   User → LLM → [stop_reason === 'tool_use'] → Execute tools → LLM → ...
 *
 * Without this loop, NYX can only do single-pass completions. Claude Desktop
 * can call tools, observe results, and reason again — unlimited turns.
 *
 * This module implements:
 *   1. A typed tool registry
 *   2. Built-in tools: web_search, read_file, run_code, mcp_call
 *   3. The agentic loop that drives multi-turn tool use
 *   4. Streaming events so the UI can show real-time tool activity
 */

import { AIService } from '@src/core/services/ai.service';
import { AISettings, ChatMessage } from '@src/infrastructure/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { MemoryStore } from './memoryStore';
import { TrajectoryLogger } from '@src/infrastructure/services/trajectoryLogger';
import { BrowserService } from '@src/core/services/browserService';

// Runtime environment detection
const isTauriEnv = typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

// Lazy Tauri invoke — returns an error string if not in Tauri
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnv) throw new Error(`Tauri not available for command: ${cmd}`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string;
  isError: boolean;
}

export interface AgentLoopEvent {
  type:
    | 'thinking'
    | 'text'
    | 'tool_start'
    | 'tool_result'
    | 'tool_running'
    | 'tool_done'
    | 'tool_error'
    | 'error'
    | 'done';
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  name?: string;
  result?: any;
  error?: string;
}

export interface AgentLoopConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings?: AISettings;
  systemInstruction?: string;
  history?: ChatMessage[];
  tools?: ToolDefinition[];
  maxIterations?: number;
  agentType?: string;
  isFastIntent?: boolean;
  signal?: AbortSignal;
}

// ── Built-in tool definitions ─────────────────────────────────────────────────

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description:
      'Search the web for current information. Use for news, prices, documentation, recent events, or anything that may have changed after the model\'s training cutoff.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_read_page',
    description: 'Fetch the live HTML content of a URL and parse it into clean Markdown using readability algorithms. Crucial for deep RAG or exploring documentation links.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The fully qualified URL to browse (e.g. https://example.com)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the user\'s filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path' },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          enum: ['utf-8', 'base64'],
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_python',
    description:
      'Execute a Python code snippet and return the output. Use for calculations, data processing, or verifying code correctness.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
        timeout_seconds: {
          type: 'number',
          description: 'Maximum execution time in seconds (default: 30)',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'mcp_call',
    description: 'Call an MCP (Model Context Protocol) tool from a connected server.',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP server name' },
        tool: { type: 'string', description: 'Tool name on the MCP server' },
        arguments: { type: 'string', description: 'JSON-encoded arguments object' },
      },
      required: ['server', 'tool'],
    },
  },
  {
    name: 'store_memory',
    description: 'Save an important fact or user preference to persistent memory. Use this when the user explicitly asks you to remember something.',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The concise fact to remember (e.g. "User prefers Python", "User lives in Berlin")' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'delete_memory',
    description: 'Delete a previously stored fact from persistent memory if it is no longer true or relevant.',
    parameters: {
      type: 'object',
      properties: {
        idOrFact: { type: 'string', description: 'The exact fact string or ID to delete' },
      },
      required: ['idOrFact'],
    },
  },
  {
    name: 'computer_action',
    description: 'Execute a direct computer action such as taking a screenshot, moving the mouse, or typing. ONLY use this when explicitly asked to interact with the screen or OS.',
    parameters: {
      type: 'object',
      properties: {
        action: { 
          type: 'string', 
          description: 'The action to perform',
          enum: ['screenshot', 'mouse_move', 'left_click', 'left_click_drag', 'right_click', 'middle_click', 'double_click', 'type', 'key']
        },
        params: {
          type: 'string',
          description: 'JSON-encoded parameters for the action. For type/key, use {"text": "something"}. For mouse, use {"x": 100, "y": 200}. For screenshot, use empty {}.'
        }
      },
      required: ['action', 'params'],
    },
  },
  {
    name: 'run_terminal_command',
    description: 'Execute a terminal command (shell). Useful for compiling, testing, checking status, or generic OS interaction.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The exact command string to run.' }
      },
      required: ['command']
    }
  },
  {
    name: 'write_file',
    description: 'Write string content to a file, completely replacing any existing content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path.' },
        content: { type: 'string', description: 'The file contents to write.' }
      },
      required: ['path', 'content']
    }
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.arguments;

  try {
    switch (toolCall.name) {
      case 'web_search': {
        const query = String(args.query || '');
        const numResults = Number(args.num_results || 5);
        let formatted = '';
        
        const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
        if (isTauri) {
          formatted = await tauriInvoke<string>('search_web_command', { query, numResults });
        } else {
          const res = await fetchWithAuth(
            `/api/v1/search?q=${encodeURIComponent(query)}&n=${numResults}`
          );
          if (!res.ok) throw new Error(`Search failed: ${res.status}`);
          const data = await res.json();
          formatted = (data.results || [])
            .slice(0, numResults)
            .map(
              (r: { title: string; url: string; snippet: string }, i: number) =>
                `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`
            )
            .join('\n\n');
        }

        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: formatted || 'No results found.',
          isError: false,
        };
      }

      case 'browser_read_page': {
        const url = String(args.url || '');
        if (!url) throw new Error('URL is required for browser_read_page');
        const markdown = await BrowserService.readPage(url);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: markdown,
          isError: false,
        };
      }

      case 'read_file': {
        if (!isTauriEnv) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: 'read_file is only available in the desktop app.', isError: true };
        }
        const content = await tauriInvoke<string>('fs_read_file', {
          path: String(args.path || ''),
        });
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: String(content),
          isError: false,
        };
      }

      case 'run_python': {
        const res = await fetchWithAuth('/api/v1/sandbox/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: 'python',
            code: String(args.code || ''),
            timeout: Number(args.timeout_seconds || 30),
          }),
        });
        if (!res.ok) throw new Error(`Sandbox error: ${res.status}`);
        const data = await res.json();
        const output = data.stdout || data.stderr || data.error || 'No output';
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: output,
          isError: Boolean(data.error || data.stderr),
        };
      }

      case 'mcp_call': {
        const server = String(args.server || '');
        const tool = String(args.tool || '');
        const toolArgsStr = String(args.arguments || '{}');
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolArgsStr);
        } catch {
          // ignore
        }
        
        if (!isTauriEnv) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: 'MCP calls are only available in the desktop app.', isError: true };
        }
        try {
          const mcpResult = await tauriInvoke('mcp_send_request', {
            serverName: server,
            request: {
              method: 'tools/call',
              params: {
                name: tool,
                arguments: toolArgs,
              },
            } as any,
          });
          return { toolCallId: toolCall.id, name: toolCall.name, result: JSON.stringify(mcpResult), isError: false };
        } catch (err: any) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: `MCP Error: ${err.message || String(err)}`, isError: true };
        }
      }

      case 'store_memory': {
        const fact = String(args.fact || '');
        if (!fact) throw new Error('Missing fact argument');
        await MemoryStore.addFact(fact);
        return { toolCallId: toolCall.id, name: toolCall.name, result: `Successfully remembered: "${fact}"`, isError: false };
      }

      case 'delete_memory': {
        const idOrFact = String(args.idOrFact || '');
        const deleted = await MemoryStore.deleteFact(idOrFact);
        if (deleted) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: `Deleted memory: "${idOrFact}"`, isError: false };
        }
        return { toolCallId: toolCall.id, name: toolCall.name, result: `Memory not found: "${idOrFact}"`, isError: true };
      }

      case 'computer_action': {
        if (!isTauriEnv) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: 'Computer actions are only available in the desktop app.', isError: true };
        }
        const action = String(args.action || '');
        const params = String(args.params || '{}');
        try {
          const compResult = await tauriInvoke<string>('execute_computer_action', { action, params });
          if (action === 'screenshot') {
            return { toolCallId: toolCall.id, name: toolCall.name, result: `Screenshot taken successfully. Base64 length: ${compResult.length}`, isError: false };
          }
          return { toolCallId: toolCall.id, name: toolCall.name, result: compResult, isError: false };
        } catch (err: any) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: `Computer action failed: ${err.message || String(err)}`, isError: true };
        }
      }

      case 'computer': {
        // Handle native Anthropic computer_20241022 block
        const action = String(args.action || '');
        const text = String(args.text || '');
        const coordinate = args.coordinate as number[];
        
        let params: any = {};
        if (action === 'type') params = { text };
        else if (action === 'key') params = { text };
        else if (coordinate) params = { x: coordinate[0], y: coordinate[1] };
        
        if (!isTauriEnv) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: 'Computer actions are only available in the desktop app.', isError: true };
        }
        
        try {
          const compResult = await tauriInvoke<string>('execute_computer_action', { action, params: JSON.stringify(params) });
          if (action === 'screenshot') {
             return { toolCallId: toolCall.id, name: toolCall.name, result: `SCREENSHOT_BASE64:${compResult}`, isError: false };
          }
          return { toolCallId: toolCall.id, name: toolCall.name, result: compResult, isError: false };
        } catch (err: any) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: `Computer action failed: ${err.message || String(err)}`, isError: true };
        }
      }

      case 'run_terminal_command': {
        if (!isTauriEnv) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: 'Terminal commands are only available in the desktop app.', isError: true };
        }
        const command = String(args.command || '');
        try {
          const output = await tauriInvoke<string>('execute_command', { command });
          return { toolCallId: toolCall.id, name: toolCall.name, result: output || 'Command succeeded with no output.', isError: false };
        } catch (err: any) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: `Command failed: ${err.message || String(err)}`, isError: true };
        }
      }

      case 'write_file': {
        if (!isTauriEnv) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: 'write_file is only available in the desktop app.', isError: true };
        }
        const path = String(args.path || '');
        const content = String(args.content || '');
        try {
          await tauriInvoke('fs_write_file', { path, content });
          return { toolCallId: toolCall.id, name: toolCall.name, result: `Successfully wrote to ${path}`, isError: false };
        } catch (err: any) {
          return { toolCallId: toolCall.id, name: toolCall.name, result: `Failed to write file: ${err.message || String(err)}`, isError: true };
        }
      }

      default:
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: `Unknown tool: ${toolCall.name}`,
          isError: true,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      result: `Tool error: ${message}`,
      isError: true,
    };
  }
}

// ── Agentic loop ──────────────────────────────────────────────────────────────

/**
 * The agentic execution loop.
 *
 * Runs the LLM → tool_use → tool_result → LLM cycle until:
 *   - The LLM emits a `stop` finish reason (natural end)
 *   - `maxIterations` is reached (safety guard)
 *   - The AbortSignal fires (user cancel)
 *
 * Yields AgentLoopEvents so the caller can stream UI updates in real time.
 */
export async function* runAgentLoop(
  prompt: string,
  config: AgentLoopConfig
): AsyncGenerator<AgentLoopEvent> {
  const {
    modelId,
    provider,
    apiKey,
    settings,
    systemInstruction,
    history = [],
    tools = BUILTIN_TOOLS,
    maxIterations = 10,
    signal,
  } = config;

  // Dynamically inject native Anthropic computer use tool if applicable
  let activeTools = [...(tools || [])];
  if (provider === 'anthropic' || modelId.includes('claude')) {
    activeTools.push({
      type: 'computer_20241022',
      name: 'computer',
      display_width_px: 1920,
      display_height_px: 1080,
      display_number: 1,
    } as any);
  }

  // Build the message history for the first turn
  const messages: ChatMessage[] = [
    ...history,
    { role: 'user', content: prompt, timestamp: Date.now() },
  ];

  // BUG 3 FIX: Store the original prompt to prevent LLM from forgetting it
  const originalPrompt = prompt;

  let iterations = 0;

  while (iterations < maxIterations) {
    if (signal?.aborted) {
      yield { type: 'error', content: 'Cancelled by user' };
      return;
    }

    iterations++;
    yield { type: 'thinking', content: `Agent turn ${iterations}/${maxIterations}…` };

    // ── LLM call ────────────────────────────────────────────────────────────
    let accumulatedText = '';
    let finishReason: string | undefined;
    let pendingToolCalls: ToolCall[] = [];

    try {
      await AIService.execute(
        modelId,
        provider,
        // BUG 3 FIX: Always pass the original user query as the "prompt", not the last tool result
        originalPrompt,
        apiKey,
        systemInstruction,
        settings,
        (event: { type: string; content: string | any[]; final: boolean }) => {
          if (event.type === 'text' && typeof event.content === 'string') {
            accumulatedText += event.content;
          } else if (event.type === 'tool_calls' && Array.isArray(event.content)) {
            pendingToolCalls = event.content.map((tc: any) => {
              const name = tc.name || tc.function?.name || 'unknown';
              let args = tc.arguments || tc.function?.arguments || {};
              if (typeof args === 'string') {
                try {
                  args = JSON.parse(args);
                } catch {
                  args = {};
                }
              }
              return {
                id: tc.id || `${name}_${Date.now()}`,
                name,
                arguments: args
              } as ToolCall;
            });
          }
        },
        signal,
        {
          history: messages.slice(0, -1), // exclude current prompt (it's the actual prompt arg)
          tools: activeTools as any,
          streamEvents: true,
        }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', content: `LLM error on turn ${iterations}: ${msg}` };
      return;
    }

    // Emit whatever text was generated this turn
    if (accumulatedText) {
      yield { type: 'text', content: accumulatedText };
    }

    if (accumulatedText || pendingToolCalls.length > 0) {
      // Push assistant turn into history
      messages.push({
        role: 'assistant',
        content: accumulatedText || '',
        toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
        timestamp: Date.now(),
      });
    }

    // ── Tool execution ───────────────────────────────────────────────────────
    if (pendingToolCalls.length === 0) {
      // BUG 1 FIX: No tools called — LLM gave an answer, we're done immediately!
      // This stops the 15-iteration infinite loop for simple conversational prompts like "hi".
      yield { type: 'done', content: '' };
      return;
    }

    // Execute all tool calls in parallel
    // (yield inside Promise.all callbacks is not valid — emit tool_start events first)
    for (const tc of pendingToolCalls) {
      yield { type: 'tool_start', content: `Calling ${tc.name}…`, toolCall: tc };
    }
    const toolResults = await Promise.all(
      pendingToolCalls.map((tc) => executeTool(tc))
    );

    for (const tr of toolResults) {
      yield { type: 'tool_result', content: tr.result, toolResult: tr };
    }

    for (const tr of toolResults) {
      if (tr.result.startsWith('SCREENSHOT_BASE64:')) {
         const b64 = tr.result.split(':')[1];
         messages.push({
           role: 'tool',
           name: tr.name,
           tool_call_id: tr.toolCallId,
           content: [
             { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }
           ],
           timestamp: Date.now(),
         } as any);
      } else {
         messages.push({
           role: 'tool',
           name: tr.name,
           tool_call_id: tr.toolCallId,
           content: tr.result,
           timestamp: Date.now(),
         } as any);
      }
    }

    // Log the trajectory
    const toolResultContent = toolResults
      .map((tr) => `[${tr.name}]: ${tr.result}`)
      .join('\n\n');
    TrajectoryLogger.getInstance().logInteraction({
      timestamp: Date.now(),
      prompt: messages[messages.length - toolResults.length - 2]?.content || prompt,
      action: pendingToolCalls[0] || null,
      observation: toolResultContent,
      success: toolResults.every(r => !r.isError)
    }).catch(console.error);
  }

  // Safety: maxIterations reached
  yield {
    type: 'error',
    content: `Agent stopped after ${maxIterations} iterations (safety limit). The task may not be complete.`,
  };
}

// ── Convenience hook ──────────────────────────────────────────────────────────

/**
 * Runs the agent loop entirely in the Rust backend via `orchestrate_supervisor`
 * for zero-latency execution.
 */
export async function* runTauriAgentLoop(
  prompt: string,
  config: AgentLoopConfig
): AsyncGenerator<AgentLoopEvent> {
  if (!isTauriEnv) {
    // Graceful fallback: route to the standard TS agent loop
    yield* runAgentLoop(prompt, config);
    return;
  }

  // Lazy-import Tauri APIs
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  const eventName = `agent_stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Set up the listener
  const eventQueue: AgentLoopEvent[] = [];
  let resolveNextEvent: (() => void) | null = null;
  let isDone = false;
  let streamError: Error | null = null;

  const unlisten = await listen<any>(eventName, (event) => {
    const payload = event.payload;

    if (payload.type === 'error') {
      streamError = new Error(payload.content || payload.error || 'Unknown error');
      isDone = true;
      if (resolveNextEvent) resolveNextEvent();
      return;
    }

    if (payload.type === 'done' || payload.done) {
      isDone = true;
      if (resolveNextEvent) resolveNextEvent();
      return;
    }

    // Map payload to AgentLoopEvent
    const loopEvent: AgentLoopEvent = {
      type: payload.type as any || payload.event_type as any || 'text',
      content: payload.content || '',
    };

    if (payload.tool_call) {
      loopEvent.toolCall = payload.tool_call;
    }
    if (payload.result) {
      loopEvent.toolResult = payload.result;
    }
    if (payload.name) {
      loopEvent.name = payload.name;
    }
    if (payload.error) {
      loopEvent.error = payload.error;
    }
    if (payload.result) {
      loopEvent.result = payload.result;
    }

    eventQueue.push(loopEvent);
    if (resolveNextEvent) resolveNextEvent();
  });

  // Call the Rust orchestrator
  // We don't await this directly because we want to yield events as they come
  const messages = [...(config.history || []), { role: 'user', content: prompt }];
  
  const invokePromise = invoke('orchestrate_supervisor', {
    messages,
    context: {
      request_id: `req_${Date.now()}`,
      session_id: AIService.getSessionToken() || 'default_session',
      provider: config.provider,
      model: config.modelId,
      api_key: config.apiKey || '',
      max_iterations: config.maxIterations || 10,
      system_instruction: config.systemInstruction || '',
      agent_type: config.agentType || 'default',
      is_fast_intent: config.isFastIntent || false,
    },
    event_name: eventName,
  }).catch((err: any) => {
    streamError = err instanceof Error ? err : new Error(String(err));
    isDone = true;
    if (resolveNextEvent) resolveNextEvent();
  }).finally(() => {
    isDone = true;
    if (resolveNextEvent) resolveNextEvent();
  });

  try {
    while (!isDone || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else {
        // Wait for next event
        await new Promise<void>((resolve) => {
          resolveNextEvent = resolve;
        });
        resolveNextEvent = null;
      }
    }
    if (streamError as any) {
      const err = streamError as any;
      yield { type: 'error', content: err.message || String(err) };
    }
  } finally {
    unlisten();
    await invokePromise;
  }
}

/**
 * React hook to run an agent loop and collect streaming events.
 * Returns a simple `run(prompt)` function and the event stream.
 */
export function createAgentRunner(config: AgentLoopConfig) {
  return {
    async *run(prompt: string) {
      yield* runAgentLoop(prompt, config);
    },
  };
}
