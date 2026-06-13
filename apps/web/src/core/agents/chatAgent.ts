import { ChatMessage, StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig, HISTORY_SLICE_SIZE } from './baseAgent';

export interface ChatAgentConfig extends BaseAgentConfig {
  updateHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

export class ChatAgent extends BaseAgent<ChatAgentConfig, StreamEvent> {
  shouldSearchWeb(prompt: string, analysis: PromptAnalysis): boolean {
    if (analysis?.intent === 'web_search') return true;

    const lower = prompt.toLowerCase();

    // Traffic Controller & Token Optimizer Rules (Local Regex triggers)
    // 1. Temporal Gaps & News
    const temporalKeywords = [
      'current news',
      'latest release',
      'breaking news',
      'recent events',
      'today',
      'now',
      'recently',
      'newest',
      'latest',
      'current',
    ];
    const infoKeywords = [
      'price',
      'weather',
      'status',
      'news',
      'release',
      'update',
      'version',
      'score',
      'match',
      'event',
    ];

    // Check for explicit temporal/live requests
    if (lower.includes('live') || lower.includes('real-time') || lower.includes('realtime'))
      return true;

    // Check for status requests
    if (
      lower.includes('is currently') ||
      lower.includes('what is the current') ||
      lower.includes('who is currently')
    )
      return true;

    // Check combinations that strongly imply real-time or recent need
    const hasTemporal =
      temporalKeywords.some((k) => lower.includes(k)) || /(2025|2026|2027)/.test(lower);
    const hasInfo = infoKeywords.some((k) => lower.includes(k));

    if (hasTemporal && hasInfo) {
      return true;
    }

    // Default to false (save tokens, do not search for every prompt)
    return false;
  }

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContext?: string,
    images?: { name: string; mimeType: string; data: string }[]
  ): AsyncGenerator<StreamEvent> {
    const reasoningChain: string[] = [];
    yield* this.emitThinking('Connecting to backend agent service...', reasoningChain);

    /**
     * Token-budget history slicing.
     * Walk backwards through history and include messages until we approach
     * the budget. Uses a 4 chars/token heuristic (~\u00B115% accuracy for English).
     * This prevents context-overflow errors on long conversations without
     * arbitrarily cutting recent messages based on count.
     */
    const MAX_HISTORY_TOKENS = 80_000; // leave headroom for system prompt + new turn
    const CHARS_PER_TOKEN = 4;

    let processedHistory = [...this.config.history];
    let tokenCount = 0;
    let sliceFrom = processedHistory.length;

    for (let i = processedHistory.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil((processedHistory[i].content?.length ?? 0) / CHARS_PER_TOKEN);
      if (tokenCount + msgTokens > MAX_HISTORY_TOKENS) break;
      tokenCount += msgTokens;
      sliceFrom = i;
    }

    if (sliceFrom > 0) {
      processedHistory = processedHistory.slice(sliceFrom);
    }

    if (searchContext) {
      processedHistory.push({
        role: 'user',
        content: `Web Search Context: ${searchContext}`,
        timestamp: Date.now(),
      });
    }

    // Pass everything to the new backend /api/v1/agents/chat endpoint
    const response = await fetch('/api/v1/agents/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.modelId,
        provider: this.config.provider,
        prompt,
        history: processedHistory,
        apiKey: this.config.apiKey,
        gatewayUrls: (this.config.settings as any)?.gatewayUrls,
        settings: this.config.settings,
        images: images || [],
        agentType: 'opencode',
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Agent backend error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body from backend');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield* this.emitThinking('Task complete.', reasoningChain);
              return;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch (err) {
              continue; // Ignore parse errors from partial JSON
            }

            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.chunk) {
              yield { type: 'text', content: parsed.chunk };
            }
            if (parsed.type === 'text') {
              yield { type: 'text', content: parsed.content };
            }
            if (parsed.type === 'thinking') {
              yield { type: 'thinking', content: parsed.content };
            }
            if (parsed.tool_call) {
              yield { type: 'tool_call', content: 'Calling tool...', metadata: parsed.tool_call };
            }
            if (parsed.tool_result) {
              yield {
                type: 'tool_result',
                content: 'Tool finished',
                metadata: parsed.tool_result,
              };
            }
            if (parsed.type === 'metrics' || parsed.type === 'meta') {
              yield parsed;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
