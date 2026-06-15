import { encoding_for_model, TiktokenModel } from 'tiktoken';

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ContextWindow {
  maxTokens: number;
  currentTokens: number;
  messages: ChatMessage[];
  summary?: string;
  summaryTokens: number;
}

// ── Provider-specific chars-per-token ratios (Fix 8) ─────────────────────────
function estimateTokensByProvider(text: string, provider = 'openai'): number {
  if (!text) return 0;
  const len = text.length;
  switch (provider) {
    case 'gemini': return Math.ceil(len / 3.5);
    case 'anthropic': return Math.ceil(len / 3.7);
    default: return Math.ceil(len / 4.0);
  }
}

export class ContextWindowManager {
  private encoder: ReturnType<typeof encoding_for_model> | null = null;
  private provider: string;

  constructor(modelId: string, provider = 'openai') {
    this.provider = provider;
    const encodingMap: Record<string, TiktokenModel> = {
      'gpt-4': 'gpt-4',
      'gpt-4o': 'gpt-4o',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
    };

    try {
      const tiktokenModel = encodingMap[modelId] || 'gpt-4o';
      this.encoder = encoding_for_model(tiktokenModel);
    } catch {
      // Non-tiktoken model — fall back to char-ratio estimation
      this.encoder = null;
    }
  }

  countTokens(text: string): number {
    if (!text) return 0;
    if (this.encoder) {
      try {
        return this.encoder.encode(text).length;
      } catch {
        // Fall through to heuristic
      }
    }
    return estimateTokensByProvider(text, this.provider);
  }

  buildContext(messages: ChatMessage[], maxTokens: number, systemPrompt?: string): ContextWindow {
    const systemTokens = systemPrompt ? this.countTokens(systemPrompt) : 0;
    const availableTokens = maxTokens - systemTokens - 1000; // Reserve 1K for response

    let currentTokens = 0;
    const included: ChatMessage[] = [];

    if (systemPrompt) {
      currentTokens += systemTokens;
    }

    // Walk backward — most recent messages have highest priority
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.countTokens(msg.content);

      if (currentTokens + msgTokens > availableTokens) {
        // Context overflow: build a placeholder summary.
        // The real LLM-based summarization is triggered asynchronously by
        // summarizeAsync() — the sync path returns a lightweight placeholder
        // so the UI doesn't block.
        const olderMessages = messages.slice(0, i + 1);
        const summary = this.buildSummaryPlaceholder(olderMessages);
        const summaryTokens = this.countTokens(summary);

        return {
          maxTokens,
          currentTokens: currentTokens + summaryTokens,
          messages: [
            { role: 'system', content: `Previous conversation summary: ${summary}` },
            ...included.reverse(),
          ],
          summary,
          summaryTokens,
        };
      }

      currentTokens += msgTokens;
      included.push(msg);
    }

    return {
      maxTokens,
      currentTokens,
      messages: included.reverse(),
      summaryTokens: 0,
    };
  }

  /**
   * Fix 6: Real LLM-based summarization.
   * Uses the cheapest available model (gemini-2.0-flash or claude-haiku)
   * to produce a high-quality summary of overflowed messages.
   * Call this asynchronously and inject the result into the next turn.
   */
  async summarizeAsync(
    messages: ChatMessage[],
    apiKey: string,
    provider: string,
    modelId: string
  ): Promise<string> {
    if (messages.length === 0) return '';

    // Truncate individual messages to avoid runaway summarization cost
    const truncated = messages.map((m) => ({
      role: m.role,
      content: m.content.slice(0, 2000), // max 2K chars per message for summary input
    }));

    const conversationText = truncated
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt = `Summarize the following conversation in 3-5 sentences. 
Capture: key topics, decisions made, code or data discussed, user's goals, and any important context.
Be concise but specific — this summary will be used as memory for a continuing conversation.

CONVERSATION:
${conversationText}

SUMMARY:`;

    try {
      // Dynamically import to avoid circular dependencies
      const { AIService } = await import('./ai.service');

      // Use the cheapest fast model for summarization
      const summaryModel =
        provider === 'anthropic'
          ? 'claude-haiku-4-5'
          : provider === 'gemini'
          ? 'gemini-2.0-flash-lite'
          : modelId; // fall back to current model

      const result = await AIService.execute(
        summaryModel,
        provider,
        summaryPrompt,
        apiKey,
        undefined,
        { temperature: 0.3, maxTokens: 512 } as any
      );

      return result.text || this.buildSummaryPlaceholder(messages);
    } catch (err) {
      console.warn('[ContextWindowManager] LLM summarization failed, using heuristic', err);
      return this.buildSummaryPlaceholder(messages);
    }
  }

  /**
   * Lightweight heuristic summary used as a fallback when LLM summarization
   * is unavailable or has not yet completed.
   */
  private buildSummaryPlaceholder(messages: ChatMessage[]): string {
    const topics = this.extractTopics(messages);
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

    const parts: string[] = [
      `${messages.length} messages exchanged.`,
    ];

    if (topics.length > 0) {
      parts.push(`Topics: ${topics.join(', ')}.`);
    }

    if (lastUserMsg) {
      parts.push(`Last user question: "${lastUserMsg.content.slice(0, 150)}..."`);
    }

    if (lastAssistantMsg) {
      parts.push(`Last response covered: "${lastAssistantMsg.content.slice(0, 150)}..."`);
    }

    return parts.join(' ');
  }

  private extractTopics(messages: ChatMessage[]): string[] {
    const text = messages.map((m) => m.content).join(' ').toLowerCase();
    const keywords = [
      'react', 'typescript', 'python', 'rust', 'go', 'api', 'database',
      'sql', 'function', 'class', 'bug', 'error', 'feature', 'test',
      'design', 'architecture', 'performance', 'security', 'deployment',
    ];
    return keywords.filter((k) => text.includes(k));
  }
}
