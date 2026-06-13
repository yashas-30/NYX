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

export class ContextWindowManager {
  private encoder: any;

  constructor(modelId: string) {
    // Map model to appropriate encoding
    const encodingMap: Record<string, string> = {

      'gemini-2.5-flash': 'cl100k_base',
      'claude-sonnet-4': 'cl100k_base',
      'gpt-4': 'cl100k_base',
    };
    
    try {
      this.encoder = encoding_for_model((encodingMap[modelId] || 'cl100k_base') as TiktokenModel);
    } catch (e) {
      // Fallback if model is not natively supported by tiktoken
      this.encoder = encoding_for_model('gpt-3.5-turbo' as TiktokenModel);
    }
  }

  countTokens(text: string): number {
    if (!text) return 0;
    // The encoder returns an Uint32Array, so we can check length
    return this.encoder.encode(text).length;
  }

  buildContext(messages: ChatMessage[], maxTokens: number, systemPrompt?: string): ContextWindow {
    const systemTokens = systemPrompt ? this.countTokens(systemPrompt) : 0;
    const availableTokens = maxTokens - systemTokens - 1000; // Reserve 1K for response

    let currentTokens = 0;
    const included: ChatMessage[] = [];

    // Always include system prompt
    if (systemPrompt) {
      currentTokens += systemTokens;
    }

    // Work backwards from most recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.countTokens(msg.content);

      if (currentTokens + msgTokens > availableTokens) {
        // Need to summarize older messages
        const olderMessages = messages.slice(0, i + 1);
        const summary = this.summarizeMessages(olderMessages);
        const summaryTokens = this.countTokens(summary);

        return {
          maxTokens,
          currentTokens: currentTokens + summaryTokens,
          messages: [
            { role: 'system', content: `Previous conversation summary: ${summary}` },
            ...included.reverse()
          ],
          summary,
          summaryTokens
        };
      }

      currentTokens += msgTokens;
      included.push(msg);
    }

    return {
      maxTokens,
      currentTokens,
      messages: included.reverse(),
      summaryTokens: 0
    };
  }

  private summarizeMessages(messages: ChatMessage[]): string {
    // Use a lightweight heuristic to summarize
    const content = messages.map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n');

    // Simple heuristic: extract key topics and decisions
    const topics = this.extractTopics(content);
    const decisions = this.extractDecisions(content);

    return [
      `Topics discussed: ${topics.length > 0 ? topics.join(', ') : 'Various tasks'}`,
      `Key decisions: ${decisions.length > 0 ? decisions.join('; ') : 'None explicitly captured'}`,
      `Total messages: ${messages.length}`
    ].join('. ');
  }

  private extractTopics(text: string): string[] {
    // Simple keyword extraction
    const keywords = ['function', 'class', 'api', 'database', 'frontend', 'backend', 'bug', 'feature', 'test', 'design', 'architecture'];
    const textLower = text.toLowerCase();
    return keywords.filter(k => textLower.includes(k));
  }

  private extractDecisions(text: string): string[] {
    // Look for decision patterns
    const patterns = [
      /decided to ([^.]+)/gi,
      /will use ([^.]+)/gi,
      /chose ([^.]+)/gi,
      /implement ([^.]+)/gi,
    ];

    const decisions: string[] = [];
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          decisions.push(match[1].trim());
        }
      }
    }

    // Return unique decisions (up to 5)
    return [...new Set(decisions)].slice(0, 5);
  }
}
