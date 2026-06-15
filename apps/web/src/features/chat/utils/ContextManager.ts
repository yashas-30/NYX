import { ChatMessage } from '@src/infrastructure/types';

export class ContextManager {
  /**
   * Truncates message history to fit within a specified context window limit.
   * Ensures the most recent messages (e.g., last 5) are always preserved,
   * while earlier messages are dropped or summarized.
   *
   * @param history The current array of chat messages
   * @param maxTokens The maximum allowed tokens for the context window
   * @param minPreservedMessages Number of recent messages that must not be dropped
   * @returns Optimized array of chat messages
   */
  static async optimizeContextWindow(
    history: ChatMessage[],
    maxTokens: number = 8192,
    minPreservedMessages: number = 5
  ): Promise<ChatMessage[]> {
    if (!history || history.length === 0) return [];

    let currentTokens = 0;
    const optimizedHistory: ChatMessage[] = [];

    // Traverse history from newest to oldest
    for (let i = history.length - 1; i >= 0; i--) {
      // Yield to main thread every 500 messages to prevent UI lockup
      if ((history.length - i) % 500 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const msg = history[i];
      // Basic token estimation: ~4 chars per token
      const contentTokens = msg.content ? Math.ceil(msg.content.length / 4) : 0;
      const reasoningTokens = msg.reasoning ? Math.ceil(msg.reasoning.length / 4) : 0;
      const msgTokens = contentTokens + reasoningTokens + 20; // 20 tokens overhead per message

      // Always keep the last N messages
      if (history.length - i <= minPreservedMessages) {
        optimizedHistory.unshift(msg);
        currentTokens += msgTokens;
        continue;
      }

      // If adding this message exceeds max tokens, we stop adding older ones
      if (currentTokens + msgTokens > maxTokens) {
        // Optionally insert a system message indicating context truncation
        optimizedHistory.unshift({
          id: 'sys-truncation',
          role: 'system',
          content:
            '[System: Earlier conversation context has been truncated to optimize token limits]',
          timestamp: Date.now(),
        });
        break;
      }

      optimizedHistory.unshift(msg);
      currentTokens += msgTokens;
    }

    return optimizedHistory;
  }
}
