import { AISettings, ChatMessage } from '@src/infrastructure/types';

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface BaseAgentConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings: AISettings;
  history: ChatMessage[];
  lightningDirectives?: string[];
  webSearchEnabled?: boolean;
  maxContextTokens?: number;
  /** Tools available to this agent. Defaults to BUILTIN_TOOLS if undefined. */
  tools?: ToolDefinition[];
  /** Whether to enable agentic tool use loop. Default: true when tools are configured. */
  enableToolLoop?: boolean;
  /** Fast intent bypass flag for simple conversational queries */
  isFastIntent?: boolean;
  /** Add-on for the system prompt based on dynamic analysis */
  systemPromptAddon?: string;
}

export class TokenBudget {
  constructor(
    private maxTokens: number,
    // Raised from 4000 to 8000 — matches our new raised max_tokens defaults
    private reservedForResponse: number = 8_000
  ) {}

  get availableForContext(): number {
    return this.maxTokens - this.reservedForResponse;
  }

  consume(tokens: number): void {
    this.maxTokens = Math.max(0, this.maxTokens - tokens);
  }

  truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    return (
      truncated.slice(0, lastNewline > 0 ? lastNewline : maxChars) +
      '\n\n[... truncated for token budget ...]'
    );
  }

  distribute(budgets: {
    codebase?: number;
    webSearch?: number;
    rules?: number;
    history?: number;
  }): Record<string, number> {
    const total = Object.values(budgets).reduce((a, b) => (a || 0) + (b || 0), 0);
    const ratio = Math.min(1, this.availableForContext / total);
    return Object.fromEntries(
      Object.entries(budgets).map(([k, v]) => [k, Math.floor((v || 0) * ratio)])
    );
  }
}

export abstract class BaseAgent<TConfig extends BaseAgentConfig, TEvent> {
  protected config: TConfig;
  protected abortController: AbortController | null = null;
  protected tokenBudget: TokenBudget;

  constructor(config: TConfig) {
    this.config = config;
    this.tokenBudget = new TokenBudget(config.maxContextTokens || 128000);
  }

  protected *emitThinking(message: string, chain: string[]): Generator<any> {
    chain.push(message);
    yield { type: 'thinking', content: message + '\n' };
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  protected combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const controller = new AbortController();
    const validSignals = signals.filter(Boolean) as AbortSignal[];

    for (const signal of validSignals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  }

  protected async *streamFromPythonAPI(
    prompt: string,
    systemInstruction: string,
    signal: AbortSignal
  ): AsyncGenerator<any> {
    const messages = [...(this.config.history || []), { role: 'user', content: prompt }];

    const requestBody = {
      messages: messages,
      model: this.config.modelId || 'gpt-4o',
      provider: this.config.provider || 'openai',
      api_key: this.config.apiKey,
      stream: true,
      system_instruction: systemInstruction
    };

    try {
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop() || ''; // Keep the incomplete line in the buffer

        for (let line of lines) {
          line = line.trim();
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') {
              yield { type: 'done' };
              return;
            }
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'content') {
                yield { type: 'text', content: data.content };
              } else if (data.type === 'tool_start') {
                yield* this.emitThinking(`Executing tool: ${data.tool_call.function.name}...`, [data.tool_call.function.arguments]);
                yield {
                  type: 'tool_start',
                  tool_call: {
                    id: data.tool_call.id,
                    name: data.tool_call.function.name,
                    args: data.tool_call.function.arguments
                  }
                };
              } else if (data.type === 'tool_execution') {
                yield { type: 'tool_running', name: data.tool };
              } else if (data.type === 'tool_result') {
                yield* this.emitThinking(`Tool result received.`, [data.result]);
                yield {
                  type: 'tool_done',
                  name: data.id,
                  result: data.result
                };
              } else if (data.type === 'error') {
                yield { type: 'error', content: data.error };
              } else if (data.type === 'done') {
                yield { type: 'done' };
              }
            } catch (e) {
              console.error("Error parsing SSE JSON", e, line);
            }
          } else if (line.startsWith('{')) {
             try {
                const data = JSON.parse(line);
                if (data.type === 'content') {
                  yield { type: 'text', content: data.content };
                } else if (data.type === 'tool_start') {
                  yield* this.emitThinking(`Executing tool: ${data.tool_call.function.name}...`, [data.tool_call.function.arguments]);
                  yield {
                    type: 'tool_start',
                    tool_call: {
                      id: data.tool_call.id,
                      name: data.tool_call.function.name,
                      args: data.tool_call.function.arguments
                    }
                  };
                } else if (data.type === 'tool_execution') {
                  yield { type: 'tool_running', name: data.tool };
                } else if (data.type === 'tool_result') {
                  yield* this.emitThinking(`Tool result received.`, [data.result]);
                  yield {
                    type: 'tool_done',
                    name: data.id,
                    result: data.result
                  };
                } else if (data.type === 'error') {
                  yield { type: 'error', content: data.error };
                } else if (data.type === 'done') {
                  yield { type: 'done' };
                }
             } catch (e) {}
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        yield { type: 'error', content: 'Request cancelled' };
      } else {
        yield { type: 'error', content: e.message };
      }
    }
  }
}
