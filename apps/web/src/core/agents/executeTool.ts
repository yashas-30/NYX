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
import { ToolRegistry } from './ToolRegistry';

// We export BUILTIN_TOOLS for backwards compatibility and easy access
export const BUILTIN_TOOLS = ToolRegistry.getBuiltinTools();

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

// Built-in tools are now defined in ToolRegistry.ts

import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const AgentState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: messagesStateReducer,
    default: () => [],
  })
});

export async function* runLangGraphAgent(
  prompt: string,
  config: AgentLoopConfig
): AsyncGenerator<AgentLoopEvent> {
  const queue: AgentLoopEvent[] = [];
  let waitingResolve: (() => void) | null = null;
  let isDone = false;
  let error: Error | null = null;

  const streamCallback = (event: AgentLoopEvent) => {
    queue.push(event);
    if (waitingResolve) {
      waitingResolve();
      waitingResolve = null;
    }
  };

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

  const llmNode = async (state: typeof AgentState.State) => {
    const chatHistory = state.messages.map((m: any) => {
      let role: 'user' | 'assistant' | 'system' | 'model' = 'user';
      if (m instanceof AIMessage) role = 'assistant';
      else if (m instanceof SystemMessage || m instanceof ToolMessage) role = 'system';
      
      let textContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      // Prune overly large tool/system outputs to prevent context bloat
      if (role === 'system' && textContent.length > 15000) {
        textContent = textContent.substring(0, 15000) + '\n...[Truncated for length]';
      }
      return { role, content: textContent };
    });

    let responseText = '';
    let toolCalls: any[] = [];
    
    try {
      const res = await AIService.execute(
        modelId,
        provider,
        prompt,
        apiKey,
        systemInstruction,
        settings,
        (chunk: any) => {
          if (typeof chunk === 'string') {
            responseText += chunk;
            streamCallback({ type: 'text', content: chunk });
          } else if (typeof chunk === 'object') {
            if (chunk.type === 'text') {
              responseText += chunk.content;
              streamCallback({ type: 'text', content: chunk.content });
            } else if (chunk.type === 'reasoning') {
              streamCallback({ type: 'thinking', content: chunk.content });
            }
          }
        },
        signal,
        {
          history: chatHistory,
          tools: tools as any,
          streamEvents: true,
        }
      );

      responseText = res.text;
      toolCalls = res.toolCalls || [];

      const msg = new AIMessage({
        content: responseText,
        tool_calls: toolCalls.map(t => ({
          id: t.id,
          name: t.name,
          args: t.arguments
        }))
      });

      return { messages: [msg] };
    } catch (err: any) {
      streamCallback({ type: 'error', content: err.message, error: err.message });
      return { messages: [new AIMessage("Error in LLM node.")] };
    }
  };

  const toolsNode = async (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    // Execute all tools concurrently to reduce latency
    const toolPromises = (lastMessage.tool_calls || []).map(async (tc) => {
      streamCallback({ type: 'thinking', content: `Executing tool ${tc.name}...` });
      try {
        const result = await executeTool({ id: tc.id || '', name: tc.name, arguments: tc.args });
        streamCallback({ type: 'tool_result', content: result as any, toolResult: result });
        return new ToolMessage({
          tool_call_id: tc.id!,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        });
      } catch (err: any) {
        streamCallback({ type: 'error', content: `Tool ${tc.name} failed: ${err.message}`, error: err.message });
        return new ToolMessage({
          tool_call_id: tc.id!,
          content: `Error: ${err.message}`
        });
      }
    });

    const results = await Promise.all(toolPromises);
    return { messages: results };
  };

  const shouldContinue = (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (lastMessage.tool_calls?.length) {
      return "tools";
    }
    return "__end__";
  };

  const workflow = new StateGraph(AgentState)
    .addNode("llm", llmNode)
    .addNode("tools", toolsNode)
    .addEdge("__start__", "llm")
    .addConditionalEdges("llm", shouldContinue)
    .addEdge("tools", "llm");

  const app = workflow.compile();

  const initialMessages = [];
  if (history && history.length > 0) {
    initialMessages.push(...history.map(m => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      return new SystemMessage(m.content);
    }));
  }

  app.invoke({ messages: initialMessages }, { recursionLimit: maxIterations }).then(() => {
    isDone = true;
    if (waitingResolve) waitingResolve();
  }).catch(err => {
    error = err;
    isDone = true;
    if (waitingResolve) waitingResolve();
  });

  let abortListener: (() => void) | null = null;
  if (signal) {
    abortListener = () => {
      isDone = true;
      error = new Error("Aborted by user");
      if (waitingResolve) waitingResolve();
    };
    signal.addEventListener('abort', abortListener, { once: true });
  }

  while (!isDone || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else {
      await new Promise<void>(r => { waitingResolve = r; });
    }
  }

  if (signal && abortListener) {
    signal.removeEventListener('abort', abortListener);
  }

  if (error) {
    yield { type: 'error', content: (error as Error).message, error: (error as Error).message };
  }
}

export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  let args = toolCall.arguments;
  try {
    args = ToolRegistry.parseArguments(toolCall.name, args);
  } catch (err: any) {
    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      result: `Invalid tool arguments (Zod validation failed): ${err.message}`,
      isError: true
    };
  }

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
      case 'navigate': {
        const url = String(args.url || '');
        if (!url) throw new Error('Missing url argument');
        try {
          const res = await fetch('http://127.0.0.1:3002/v1/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!data.success) throw new Error('Scraping failed on backend');
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: `Navigated to ${url}. Content:\n${data.data.markdown.substring(0, 4000)}...`,
            isError: false
          };
        } catch (err: any) {
          // Fallback to Tauri invoke if scrapling server is not running
          const html = await BrowserService.readPage(url);
          return { toolCallId: toolCall.id, name: toolCall.name, result: html, isError: false };
        }
      }
      case 'click_element': {
        const selector = String(args.selector || '');
        if (!selector) throw new Error('Missing selector argument');
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: `Clicked element [${selector}]. Note: In headless extraction mode, dynamic interactions require a full page re-fetch.`,
          isError: false
        };
      }
      case 'extract_data': {
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          result: `Data extraction requested. Use navigate to pull the full markdown representation of the target URL.`,
          isError: false
        };
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

