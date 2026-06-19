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
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { McpRegistry } from '@src/core/mcp/McpRegistry';

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
    properties: Record<string, { type: string; description: string; enum?: string[]; items?: any }>;
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
  searchResults?: any[];
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
    | 'done'
    | 'citation'
    | 'artifact'
    | 'tool_approval_required';
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  name?: string;
  result?: any;
  error?: string;
  metadata?: any;
  approvalId?: string;
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
    description: 'Search the web for current information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        num_results: { type: 'number', description: 'Number of results to return (default: 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to read' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write contents to a file on the local filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'The content to write to the file' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Replace a specific target block in a file with new replacement content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        target: { type: 'string', description: 'The exact block of text in the file to find' },
        replacement: { type: 'string', description: 'The replacement content' }
      },
      required: ['path', 'target', 'replacement']
    }
  },
  {
    name: 'list_directory',
    description: 'List all files and folders in a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory' }
      },
      required: ['path']
    }
  },
  {
    name: 'grep_search',
    description: 'Search recursively in a directory for files containing a specific pattern.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory to search' },
        query: { type: 'string', description: 'The pattern/text to search for' }
      },
      required: ['path', 'query']
    }
  },
  {
    name: 'diff_files',
    description: 'Show line-by-line differences between two files.',
    parameters: {
      type: 'object',
      properties: {
        path_a: { type: 'string', description: 'Path to first file' },
        path_b: { type: 'string', description: 'Path to second file' }
      },
      required: ['path_a', 'path_b']
    }
  },
  {
    name: 'web_browse',
    description: 'Open a Tauri-native browser overlay window to view and navigate to a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' }
      },
      required: ['url']
    }
  },
  {
    name: 'fetch_page',
    description: 'Fetch a webpage\'s HTML and extract its clean readable text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' }
      },
      required: ['url']
    }
  },
  {
    name: 'web_scrape',
    description: 'Scrape specific content from a page by fetching and selecting lines containing a keyword.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        keyword: { type: 'string', description: 'Keyword to filter matching lines' }
      },
      required: ['url', 'keyword']
    }
  },
  {
    name: 'run_python',
    description: 'Execute a Python code script.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code block to run' }
      },
      required: ['code']
    }
  },
  {
    name: 'run_javascript',
    description: 'Execute a Node.js JavaScript code script.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code block to run' }
      },
      required: ['code']
    }
  },
  {
    name: 'run_terminal_command',
    description: 'Execute a terminal command on the host machine. On Windows, this runs in PowerShell. On Unix, it runs in sh.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The terminal command to run' },
        cwd: { type: 'string', description: 'Optional absolute path specifying the current working directory for the command' }
      },
      required: ['command']
    }
  },
  {
    name: 'run_shell',
    description: 'Execute a shell command in a specified directory.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run' },
        cwd: { type: 'string', description: 'Directory to run the command in' }
      },
      required: ['command', 'cwd']
    }
  },
  {
    name: 'run_test',
    description: 'Run standard tests using a specified command.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command (e.g. \'cargo test\' or \'npm test\')' },
        cwd: { type: 'string', description: 'Directory to run tests in' }
      },
      required: ['command', 'cwd']
    }
  },
  {
    name: 'lint_code',
    description: 'Run a linter command in a specified directory.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Linter command (e.g. \'eslint\' or \'cargo clippy\')' },
        cwd: { type: 'string', description: 'Directory to run linting in' }
      },
      required: ['command', 'cwd']
    }
  },
  {
    name: 'get_system_info',
    description: 'Retrieve CPU architecture, platform, and memory statistics of the host machine.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'take_screenshot',
    description: 'Capture the primary display monitor screenshot and save it to the workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path where the screenshot JPEG will be saved' }
      },
      required: ['path']
    }
  },
  {
    name: 'run_mcp_tool',
    description: 'Invoke an MCP tool on a specified configured server.',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP Server name' },
        tool: { type: 'string', description: 'Tool name to call' },
        arguments: { type: 'string', description: 'JSON arguments object passed to the tool' }
      },
      required: ['server', 'tool', 'arguments']
    }
  },
  {
    name: 'schedule_task',
    description: 'Schedule a command to run after a delay.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Delay in seconds' },
        command: { type: 'string', description: 'Command to run' }
      },
      required: ['seconds', 'command']
    }
  },
  {
    name: 'read_pdf',
    description: 'Read and extract plain text from a PDF file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to PDF file' }
      },
      required: ['path']
    }
  },
  {
    name: 'read_docx',
    description: 'Read and extract plain text from a Word DOCX file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to DOCX file' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_presentation',
    description: 'Create a slideshow presentation in markdown slides format.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to save presentation file' },
        title: { type: 'string', description: 'Title of presentation' },
        slides: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of slide texts'
        }
      },
      required: ['path', 'title', 'slides']
    }
  },
  {
    name: 'create_spreadsheet',
    description: 'Create a CSV spreadsheet file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to save spreadsheet CSV' },
        headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Spreadsheet headers'
        },
        rows: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' }
          },
          description: 'List of row cells'
        }
      },
      required: ['path', 'headers', 'rows']
    }
  },
  {
    name: 'generate_image',
    description: 'Generate an image file.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the image to generate' },
        path: { type: 'string', description: 'Path to save generated image file' }
      },
      required: ['prompt', 'path']
    }
  },
  {
    name: 'edit_image',
    description: 'Edit/modify an image based on a prompt.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to original image file' },
        prompt: { type: 'string', description: 'Prompt instructions to modify the image' }
      },
      required: ['path', 'prompt']
    }
  },
  {
    name: 'analyze_image',
    description: 'Analyze an image file and answer a question about it.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to image file' },
        question: { type: 'string', description: 'Question to answer about the image content' }
      },
      required: ['path', 'question']
    }
  }
];

async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.arguments;

  // 1. Check if this is an MCP tool
  const mcpServerId = await McpRegistry.findServerForTool(toolCall.name);
  if (mcpServerId) {
    try {
      const result = await McpRegistry.callTool(mcpServerId, toolCall.name, args);
      // Format MCP content blocks into string result
      let resultString = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      if (result && result.content && Array.isArray(result.content)) {
        resultString = result.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
      }
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: resultString,
        isError: result.isError || false
      };
    } catch (err: any) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: `MCP Execution Error: ${err.message || String(err)}`,
        isError: true
      };
    }
  }

  if (isTauriEnv) {
    try {
      const result = await tauriInvoke<string>('run_agent_tool', {
        name: toolCall.name,
        argsJson: JSON.stringify(args)
      });
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result,
        isError: result.startsWith('Error:')
      };
    } catch (err: any) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: `Tauri run_agent_tool error: ${err.message || String(err)}`,
        isError: true
      };
    }
  }

  // Web fallback
  try {
    switch (toolCall.name) {
      case 'web_search': {
        const query = String(args.query || '');
        const numResults = Number(args.num_results || 5);
        const { searchWeb } = await import('@src/infrastructure/api/searchApi');
        const searchResult = await searchWeb(query, undefined, { topK: numResults });
        
        if (!searchResult.success) {
           return {
             toolCallId: toolCall.id,
             name: toolCall.name,
             result: `Search failed: ${searchResult.error}`,
             isError: true,
           };
        }

        const formatted = (searchResult.results || [])
          .slice(0, numResults)
          .map(
            (r: any, i: number) =>
              `[${i + 1}] ${r.title}\n${r.url}\nSnippet: ${r.snippet}\n\nFull Content:\n${r.raw_content || 'Not available'}`
          )
          .join('\n\n---\n\n');

        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: formatted || 'No results found.',
          isError: false,
          searchResults: searchResult.results || [],
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
      default:
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: `Tool ${toolCall.name} is only available in desktop app mode.`,
          isError: true,
        };
    }
  } catch (err: any) {
    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      result: `Tool execution error: ${err.message || String(err)}`,
      isError: true
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

  // Phase 2: Dynamically inject MCP tools
  try {
    const mcpRawTools = await McpRegistry.getAllTools();
    const mcpMappedTools = mcpRawTools.map(t => ({
      name: t.name,
      description: t.description || 'MCP Tool',
      parameters: t.inputSchema || { type: 'object', properties: {} }
    }));
    activeTools = [...activeTools, ...mcpMappedTools];
  } catch (err) {
    console.error("[AgentLoop] Failed to fetch MCP tools:", err);
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
      yield { type: 'tool_running', content: `Running ${tc.name}…`, name: tc.name };
    }
    const toolResults = await Promise.all(
      pendingToolCalls.map((tc) => executeTool(tc))
    );

    for (const tr of toolResults) {
      if (tr.isError) {
        yield { type: 'tool_error', content: tr.result, name: tr.name, error: tr.result };
      } else {
        yield { type: 'tool_done', content: tr.result, name: tr.name, result: tr.result };
      }
      yield { type: 'tool_result', content: tr.result, toolResult: tr };

      // Yield citations if it's a web search
      if (tr.name === 'web_search' && tr.searchResults) {
        let index = 1;
        for (const r of tr.searchResults) {
          yield {
            type: 'citation' as any,
            content: '',
            metadata: {
              id: String(index++),
              url: r.url,
              title: r.title,
              snippet: r.snippet,
              source: r.title,
            }
          } as any;
        }
      }
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
    if (payload.event_type === 'tool_approval_required') {
      let argsObj = {};
      try {
        argsObj = JSON.parse(payload.arguments || '{}');
      } catch {
        // ignore
      }
      loopEvent.toolCall = {
        id: payload.tool_call_id || '',
        name: payload.name || '',
        arguments: argsObj,
      };
      loopEvent.approvalId = payload.approval_id;
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
