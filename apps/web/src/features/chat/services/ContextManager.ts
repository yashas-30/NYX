import { ChatMessage } from '@src/infrastructure/types';

export interface ContextWindow {
  messages: ChatMessage[];
  tokenCount: number;
  topics: string[];
}

export class ContextManager {
  private readonly MAX_TOKENS: number;
  private readonly TOKEN_MULTIPLIER = 4; // chars per token heuristic

  constructor(maxTokens: number = 128000) {
    this.MAX_TOKENS = maxTokens;
  }

  /**
   * Compresses chat history to fit within context window.
   * Keeps system prompt (if any), recent messages, and drops middle ones.
   */
  public truncate(history: ChatMessage[]): ContextWindow {
    let currentTokens = 0;
    const keep: ChatMessage[] = [];

    // Always keep the last 5 messages if possible
    const mandatoryCount = Math.min(5, history.length);
    for (let i = history.length - 1; i >= history.length - mandatoryCount; i--) {
      const msg = history[i];
      const tokens = this.estimateTokens(msg.content || '');
      currentTokens += tokens;
      keep.unshift(msg);
    }

    // Work backwards for the rest
    for (let i = history.length - mandatoryCount - 1; i >= 0; i--) {
      const msg = history[i];
      const tokens = this.estimateTokens(msg.content || '');

      if (currentTokens + tokens > this.MAX_TOKENS) {
        break; // Reached capacity
      }

      currentTokens += tokens;
      keep.unshift(msg);
    }

    return {
      messages: keep,
      tokenCount: currentTokens,
      topics: this.extractTopics(keep),
    };
  }

  /**
   * Groups messages into topics based on recency and simple keyword extraction.
   */
  public extractTopics(messages: ChatMessage[]): string[] {
    const topics = new Set<string>();
    const userMsgs = messages.filter((m) => m.role === 'user').slice(-5);

    for (const msg of userMsgs) {
      const words = (msg.content || '')
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 5);
      words.slice(0, 3).forEach((w) => topics.add(w));
    }

    return Array.from(topics).slice(0, 5);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.TOKEN_MULTIPLIER);
  }
}
