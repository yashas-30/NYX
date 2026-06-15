import { AISettings, ChatMessage } from '@src/infrastructure/types';

export interface BaseAgentConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings: AISettings;
  history: ChatMessage[];
  lightningDirectives?: string[];
  webSearchEnabled?: boolean;
  maxContextTokens?: number;
}

export class TokenBudget {
  constructor(
    private maxTokens: number,
    private reservedForResponse: number = 4000
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
}
