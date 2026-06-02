import { ChatMessage, StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig, HISTORY_SLICE_SIZE } from './baseAgent';

export interface ChatAgentConfig extends BaseAgentConfig {
  updateHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

export class ChatAgentWithTools extends BaseAgent<ChatAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContext?: string,
    images?: File[]
  ): AsyncGenerator<StreamEvent> {
    const reasoningChain: string[] = [];
    yield* this.emitThinking('Connecting to backend agent service...', reasoningChain);

    let processedHistory = [...this.config.history];
    if (processedHistory.length > HISTORY_SLICE_SIZE) {
      processedHistory = processedHistory.slice(-HISTORY_SLICE_SIZE);
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
        gatewayUrls: this.config.settings?.gatewayUrls,
        images: images ? images.map((f: any) => f.name) : [], // simplified image handling
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
            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                throw new Error(parsed.error);
              }

              if (parsed.chunk) {
                yield { type: 'text', content: parsed.chunk };
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
            } catch (err) {
              // Ignore parse errors from partial JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
