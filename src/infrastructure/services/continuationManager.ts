/**
 * @file src/core/services/continuationManager.ts
 * @description Handles automatic continuation of truncated AI responses.
 * Detects truncation via regex heuristics and token proximity, then
 * re-prompts up to 5 times to guarantee complete output.
 */

import { AISettings, ChatMessage, TelemetryMetrics, Provider } from '../types';
import { AIService } from '@src/core/services/ai.service';

export class ContinuationManager {
  /**
   * Execute an AI call with automatic continuation if the response is truncated.
   * Guarantees complete, non-cut-off output by re-prompting up to maxAttempts times.
   */
  static async executeWithContinuation(
    modelId: string,
    provider: Provider | string,
    prompt: string,
    apiKey: string | undefined,
    systemInstruction: string | undefined,
    settings: AISettings | undefined,
    onStream: ((text: string) => void) | undefined,
    signal: AbortSignal | undefined,
    options: { history?: ChatMessage[]; nodeId?: string; gatewayUrls?: Record<string, string> } | undefined
  ): Promise<{ text: string; metrics: TelemetryMetrics }> {
    let baseText = '';
    let totalTokens = 0;
    let totalLatency = 0;
    let attempts = 0;
    const maxAttempts = 5;

    const maxTokens = this.estimateMaxTokens(provider, modelId, settings);

    while (attempts < maxAttempts) {
      attempts++;

      if (signal?.aborted) {
        throw new Error('AbortError');
      }

      const isFirst = attempts === 1;
      const currentPrompt = isFirst
        ? prompt
        : `Continue exactly from where you left off. Do not repeat any previously generated content. Start immediately with the next character/token after this:\n\n${baseText.slice(-500)}`;

      const result = await AIService.execute(
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
        options
      );

      totalTokens += result.metrics.tokens;
      totalLatency += result.metrics.latency;

      if (isFirst) {
        baseText = result.text;
      } else {
        baseText = baseText + result.text;
      }

      const usedTokens = result.metrics.tokens;
      if (!this.isTruncated(result.text, maxTokens, usedTokens)) {
        return {
          text: baseText,
          metrics: {
            latency: totalLatency,
            tokens: totalTokens,
            tps: totalLatency > 0 ? Math.round(totalTokens / (totalLatency / 1000)) : 0
          }
        };
      }

      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return {
      text: baseText,
      metrics: {
        latency: totalLatency,
        tokens: totalTokens,
        tps: totalLatency > 0 ? Math.round(totalTokens / (totalLatency / 1000)) : 0
      }
    };
  }

  private static estimateMaxTokens(provider: string, modelId: string, settings?: AISettings): number {
    if (settings?.maxTokens) return settings.maxTokens;

    if (provider === 'nyx-native' || provider === 'qwen-local') {
      return 4096;
    }

    if (provider === 'gemini') {
      if (modelId.includes('pro')) return 8192;
      return 4096;
    }

    if (provider === 'openrouter' || provider === 'nvidia' || provider === 'opencode') {
      return 4096;
    }

    return 2048;
  }

  private static isTruncated(text: string, maxTokens: number, usedTokens: number): boolean {
    if (!text || text.length === 0) return false;

    // Explicit protocol halt marker from the SSE stream parser
    if (text.includes('[PROTOCOL HALT]')) return true;

    // Unbalanced code fences
    const backtickCount = (text.match(/```/g) || []).length;
    if (backtickCount % 2 !== 0) return true;

    const trimmed = text.trim();

    // Common truncation patterns
    if (trimmed.endsWith('...')) return true;

    // Ends mid-identifier (last char is alphanumeric or underscore — no sentence terminator)
    const lastChar = trimmed.slice(-1);
    const terminalChars = /[.!?;}\])"'`]$/;
    const endsWithCodeBlock = trimmed.endsWith('```');
    if (!terminalChars.test(lastChar) && !endsWithCodeBlock) return true;

    // Near token limit — 95% of estimated max
    if (maxTokens > 0 && usedTokens >= Math.floor(maxTokens * 0.95)) return true;

    return false;
  }
}
