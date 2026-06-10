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
      mode = 'prune',
      provider = 'gemini', // Fallback, but ChatService passes the real one
      modelId = 'gemini-3.5-flash', // Fallback, but ChatService passes the real one
    } = options;

    if (mode === 'off') {
      return messages;
    }

    const currentTokens = this.estimateMessageTokens(messages);
    logger.info(`[ContextOptimizer] Current tokens: ~${currentTokens}/${maxTokens}`);

    if (currentTokens <= maxTokens || messages.length <= preservationTurns + 2) {
      // Under limit or too few messages to compress safely
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
      // Hard prune: just drop the middle messages
      logger.info(`[ContextOptimizer] Pruned ${middleMessages.length} messages.`);
      return [...systemMessages, ...recentMessages];
    }

    if (mode === 'summarize') {
      try {
        const summary = await this.summarizeMiddleContext(middleMessages, provider, modelId);
        logger.info(`[ContextOptimizer] Generated summary for ${middleMessages.length} messages.`);
        
        const summaryMessage = {
          role: 'assistant',
          content: `[System Note: Summary of previous conversation]\n${summary}`,
        };

        return [...systemMessages, summaryMessage, ...recentMessages];
      } catch (e: any) {
        logger.warn(`[ContextOptimizer] Summarization failed, falling back to prune: ${e.message}`);
        return [...systemMessages, ...recentMessages];
      }
    }

    return messages;
  }

  private static async summarizeMiddleContext(
    messages: any[],
    provider: string,
    modelId: string
  ): Promise<string> {
    const keys = getKeysSync();
    const apiKey = keys[provider] || '';

    logger.info(`[ContextOptimizer] Using ${provider}/${modelId} for summarization`);

    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n\n');

    const prompt = `Summarize the following conversation segment concisely. Focus on the core topics discussed, any facts established, and decisions made. Keep it very brief.\n\nConversation:\n${transcript}`;

    return new Promise((resolve, reject) => {
      let summary = '';
      UnifiedEngine.executeStream(
        {
          provider,
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          settings: { temperature: 0.2, maxTokens: 500 },
          apiKey,
        },
        (chunk: any) => {
          summary += chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '';
        },
        () => {
          resolve(summary.trim());
        }
      ).catch(reject);
    });
  }
}
