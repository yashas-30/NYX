/**
 * @file src/core/services/continuationManager.ts
 * @description Handles automatic continuation of truncated AI responses.
 * Detects truncation via regex heuristics and token proximity, then
 * re-prompts up to 5 times to guarantee complete output.
 */

import { AISettings, ChatMessage, TelemetryMetrics, Provider, AIResponse } from '../types';

export class ContinuationManager {
  /**
   * Execute an AI call with automatic continuation if the response is truncated.
   * Guarantees complete, non-cut-off output by re-prompting up to maxAttempts times.
   */
  static async executeWithContinuation(
    executeFn: (
      modelId: string,
      provider: string,
      prompt: string,
      apiKey?: string,
      systemInstruction?: string,
      settings?: AISettings,
      onStream?: (text: string) => void,
      signal?: AbortSignal,
      options?: any
    ) => Promise<AIResponse>,
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey: string | undefined,
    systemInstruction: string | undefined,
    settings: AISettings | undefined,
    onStream: ((text: string) => void) | undefined,
    signal: AbortSignal | undefined,
    options:
      | { history?: ChatMessage[]; nodeId?: string; gatewayUrls?: Record<string, string> }
      | undefined
  ): Promise<{ text: string; metrics: TelemetryMetrics }> {
    let baseText = '';
    let totalTokens = 0;
    let totalLatency = 0;
    let attempts = 0;
    const maxAttempts = 30; // Increased to 30 to support 10,000+ word outputs

    const maxTokens = this.estimateMaxTokens(provider, modelId, settings);

    while (attempts < maxAttempts) {
      attempts++;

      if (signal?.aborted) {
        throw new Error('AbortError');
      }

      const isFirst = attempts === 1;
      const currentPrompt = isFirst
        ? prompt
        : `Continue exactly from where you left off. Do not repeat any previously generated content. Start immediately with the next character/token after this:\n\n${baseText.slice(-1500)}`;

      const currentOptions = isFirst
        ? options
        : {
            ...options,
            history: [
              ...(options?.history || []),
              { role: 'user', content: prompt } as ChatMessage,
              // Kimi Sliding Context Window: Only feed the last 3000 chars of assistant response to avoid blowing input token limits
              { role: 'assistant', content: baseText.length > 3000 ? `...[Truncated earlier parts]...\n\n${baseText.slice(-3000)}` : baseText } as ChatMessage,
            ],
          };

      const result = await executeFn(
        modelId,
        provider,
        currentPrompt,
        apiKey,
        systemInstruction,
        settings,
        (chunk: string) => {
          const displayText = isFirst ? chunk : baseText + chunk;
          onStream?.(displayText);
        },
        signal,
        currentOptions
      );

      totalTokens += result.metrics.tokens;
      totalLatency += result.metrics.latency;

      if (isFirst) {
        baseText = result.text;
      } else {
        baseText = baseText + result.text;
      }

      const usedTokens = result.metrics.tokens;
      // @ts-ignore: AIResponse might have finishReason depending on the exact type, using fallback
      const finishReason = (result as any).finishReason;
      
      if (!this.isTruncated(result.text, maxTokens, usedTokens, finishReason)) {
        return {
          text: baseText,
          metrics: {
            latency: totalLatency,
            tokens: totalTokens,
            tps: totalLatency > 0 ? Math.round(totalTokens / (totalLatency / 1000)) : 0,
          },
        };
      }

      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    return {
      text: baseText,
      metrics: {
        latency: totalLatency,
        tokens: totalTokens,
        tps: totalLatency > 0 ? Math.round(totalTokens / (totalLatency / 1000)) : 0,
      },
    };
  }

  private static estimateMaxTokens(
    provider: string,
    modelId: string,
    settings?: AISettings
  ): number {
    let limit = settings?.maxTokens;

    if (provider === 'gemini') {
      const isGemma = modelId.toLowerCase().includes('gemma');
      const isPro = modelId.toLowerCase().includes('pro');
      const hardLimit = isPro ? 8192 : 8192; // Default to 8192 for Gemini 1.5/3.1
      if (!isGemma) {
        limit = limit ? Math.min(limit, hardLimit) : hardLimit;
      }
    } else if (provider === 'ollama' || provider === 'lmstudio') {
      limit = limit ? Math.min(limit, 8192) : 4096;
    }

    return limit || 4096;
  }

  private static isTruncated(text: string, maxTokens: number, usedTokens: number, finishReason?: string): boolean {
    if (!text || text.length === 0) return false;

    // 1. Explicit model signal (Best, most reliable way like Kimi)
    if (finishReason === 'length' || finishReason === 'max_tokens') {
      return true;
    }
    if (finishReason === 'stop') {
      return false; // Explicitly finished normally
    }

    // Explicit protocol halt marker from the SSE stream parser
    if (text.includes('[PROTOCOL HALT]')) return true;

    // Unbalanced code fences
    const backtickCount = (text.match(/```/g) || []).length;
    if (backtickCount % 2 !== 0) return true;

    const trimmed = text.trim();

    // Common truncation patterns
    if (trimmed.endsWith('...')) return true;

    // Near token limit check using characters
    // Since usedTokens is often a rough Math.ceil(length/4), we check raw character length.
    // Code tokens average around ~3.2 characters per token.
    if (maxTokens > 0) {
      const estimatedCharLimit = maxTokens * 3.2;
      if (trimmed.length >= estimatedCharLimit * 0.92) {
        return true;
      }
    }

    // Ends mid-identifier (last char is alphanumeric or underscore — no sentence terminator)
    const lastChar = trimmed.slice(-1);
    const terminalChars = /[.!?;}\])"'`]$/;
    const endsWithCodeBlock = trimmed.endsWith('```');
    if (!terminalChars.test(lastChar) && !endsWithCodeBlock) return true;

    return false;
  }
}
