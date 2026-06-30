import { ChatMessage } from '@src/infrastructure/types';
import { countTokens } from '@src/features/ai/services/ai.service';

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
      // Accurate token count via tiktoken cl100k_base (falls back to length/3.5 heuristic)
      const contentTokens = msg.content ? countTokens(msg.content) : 0;
      const reasoningTokens = msg.reasoning ? countTokens(msg.reasoning) : 0;
      const msgTokens = contentTokens + reasoningTokens + 20; // 20 tokens overhead per message


      // Always keep the last N messages
      if (history.length - i <= minPreservedMessages) {
        optimizedHistory.unshift(msg);
        currentTokens += msgTokens;
        continue;
      }

      // If adding this message exceeds max tokens, we stop adding older ones
      if (currentTokens + msgTokens > maxTokens) {
        // Here we summarize or persist the dropped context to memory.
        const droppedMessages = history.slice(0, i + 1);
        
        // Extract key information to compress
        const summary = droppedMessages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => `[${m.role.toUpperCase()}]: ${m.content?.substring(0, 100)}...`)
          .join('\\n');

        // Persist to cognitive memory asynchronously without blocking
        import('@src/infrastructure/services/workspaceIntelligence').then(({ WorkspaceIntelligence }) => {
          WorkspaceIntelligence.addMemory(
            `Summarized conversation history: ${summary}`,
            'user',
            ['conversation', 'summary', 'context-drop']
          );
        }).catch(err => console.warn('Failed to persist memory:', err));

        optimizedHistory.unshift({
          id: 'sys-truncation',
          role: 'system',
          content:
            `[System: Earlier conversation context has been truncated to optimize token limits. Summary of dropped context:\\n${summary}]`,
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
