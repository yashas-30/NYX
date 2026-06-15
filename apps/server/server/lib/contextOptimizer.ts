import logger from './logger.js';
import { UnifiedEngine } from './unifiedEngine.js';
import { getKeysSync } from '../features/vault/vault.service.js';

export interface ContextOptimizerOptions {
  maxTokens?: number; // Soft limit before we compress
  preservationTurns?: number; // How many recent turns to keep
  mode?: 'off' | 'prune' | 'summarize';
  provider?: string;
  modelId?: string;
}

export class ContextOptimizer {
  /**
   * Extremely rough token estimation: ~4 characters per token for English.
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  static estimateMessageTokens(messages: any[]): number {
    return messages.reduce((acc, m) => {
      let content = m.content || '';
      if (typeof content !== 'string') {
        content = JSON.stringify(content);
      }
      return acc + this.estimateTokens(content);
    }, 0);
  }

  /**
   * Compresses the message history if it exceeds the maximum token limit.
   */
  static async compressHistory(
    messages: any[],
    options: ContextOptimizerOptions = {}
  ): Promise<any[]> {
    const {
      maxTokens = 32000,
      preservationTurns = 6,
      mode = 'summarize',
      provider = 'gemini', // Fallback, but ChatService passes the real one
      modelId = 'gemini-3.5-flash', // Fallback, but ChatService passes the real one
    } = options;

    if (mode === 'off') {
      return messages;
    }

    const currentTokens = this.estimateMessageTokens(messages);
    logger.info(`[ContextOptimizer] Current tokens: ~${currentTokens}/${maxTokens}`);

    if (currentTokens <= maxTokens * 0.6 || messages.length <= preservationTurns + 2) {
      // Under 60% threshold or too few messages to compress safely
      return messages;
    }

    logger.info(`[ContextOptimizer] Token threshold exceeded. Compressing using mode: ${mode}`);

    // Anchor: System message is always kept
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversation = messages.filter((m) => m.role !== 'system');

    if (conversation.length <= preservationTurns) {
      return messages;
    }

    // Recency: Keep the last N turns
    const recentMessages = conversation.slice(-preservationTurns);
    
    // Compression Zone: The middle turns
    const middleMessages = conversation.slice(0, -preservationTurns);

    if (mode === 'prune') {
      // Keep important messages from the middle, drop unimportant ones
      const importantMiddle = middleMessages.filter(m => this.isImportantMessage(m));
      logger.info(`[ContextOptimizer] Pruned ${middleMessages.length - importantMiddle.length} unimportant messages, kept ${importantMiddle.length} important.`);
      return [...systemMessages, ...importantMiddle, ...recentMessages];
    }

    if (mode === 'summarize') {
      try {
        // Only summarize unimportant messages; preserve important ones verbatim
        const importantMiddle = middleMessages.filter(m => this.isImportantMessage(m));
        const unimportantMiddle = middleMessages.filter(m => !this.isImportantMessage(m));

        let summaryMessages: any[] = [];
        if (unimportantMiddle.length > 0) {
          const { RollingSummarizer } = await import('../features/memory/RollingSummarizer.js');
          const keys = getKeysSync();
          const apiKey = keys[provider] || '';
          const summary = await RollingSummarizer.summarizeContext(unimportantMiddle, { apiKey });
          
          if (summary) {
            logger.info(`[ContextOptimizer] Generated summary for ${unimportantMiddle.length} messages; kept ${importantMiddle.length} important messages verbatim.`);
            summaryMessages = [{
              role: 'assistant',
              content: `[System Note: Summary of previous conversation]\n${summary}`,
            }];
          } else {
             logger.warn('[ContextOptimizer] RollingSummarizer returned null, falling back to prune.');
          }
        }

        return [...systemMessages, ...summaryMessages, ...importantMiddle, ...recentMessages];
      } catch (e: any) {
        logger.warn(`[ContextOptimizer] Summarization failed, falling back to prune: ${e.message}`);
        return [...systemMessages, ...recentMessages];
      }
    }

    return messages;
  }

  /**
   * Returns true if a message contains high-value content that should be
   * preserved verbatim during context compression.
   */
  static isImportantMessage(msg: any): boolean {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // Code blocks, tool results, system notes are important
    return content.includes('```') ||
      content.includes('[System Note') ||
      content.includes('Error:') ||
      content.startsWith('function') ||
      (msg.toolCalls && msg.toolCalls.length > 0);
  }
}
