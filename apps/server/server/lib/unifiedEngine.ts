import { Provider, ChatMessage, AISettings, getModelCapabilities } from '@nyx/shared';
import { env } from '../config/env.js';
import { Gateway } from './gateway.js';
import logger from './logger.js';
import { AIEngine } from './aiEngine.js';
import { SmartRouter } from './router.js';
import { loadKeys } from '../features/vault/vault.service.js';
import { compressPrompt } from '../features/prompts/compression.js';
import { workerPool } from './workers/workerPool.js';
import { NyxTelemetry } from './telemetry.js';
import { CacheServer } from './cache.js';
import { ABSTENTION_INSTRUCTION, resolveRealGeminiModel } from './modelUtils.js';

export interface ModelSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  antigravity?: boolean;
  /** Adaptive thinking token budget (M1). Range: 256–24576. Resolved by thinkingBudget.ts. */
  thinkingBudget?: number;
}


export interface StreamChunk {
  chunk?: string;
  choices?: Array<{ delta: { content: string } }>;
  token?: string;
  error?: string;
  type?: string;
  antigravity_id?: string;
}

export interface UnifiedEngineExecuteParams {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  customGatewayUrls?: Record<string, string>;
  settings?: any;
  tools?: any[];
  signal?: AbortSignal;
}

export interface ExecuteOptions {
  provider: string;
  model: string;
  messages: ChatMessage[];
  settings?: ModelSettings;
  apiKey?: string;
  customGatewayUrls?: Record<string, string>;
  tools?: any[];
  signal?: AbortSignal;
}

// Per-provider limits for GPU and Quota Protection (Phase 1.5)
const PROVIDER_LIMITS: Record<string, { maxConcurrent: number; maxPerMinute: number }> = {
  gemini: { maxConcurrent: 10, maxPerMinute: 60 },
  ollama: { maxConcurrent: 3, maxPerMinute: 30 },
  lmstudio: { maxConcurrent: 2, maxPerMinute: 20 },
};

// In-memory concurrency tracking
const activeConnections: Record<string, number> = {
  gemini: 0,
  ollama: 0,
  lmstudio: 0,
};

// Estimate tokens: ~4 chars per token (rough heuristic)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sliceHistoryByTokens(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  let total = 0;
  const result: ChatMessage[] = [];
  
  // Iterate backwards from most recent
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content || '');
    if (total + msgTokens > maxTokens) break;
    total += msgTokens;
    result.unshift(messages[i]);
  }
  
  return result;
}



function injectAbstentionInstruction(messages: ChatMessage[]): ChatMessage[] {
  const systemIdx = messages.findIndex((m) => m.role === 'system');
  if (systemIdx >= 0) {
    const updated = [...messages];
    updated[systemIdx] = {
      ...updated[systemIdx],
      content: `${updated[systemIdx].content}\n\n${ABSTENTION_INSTRUCTION}`,
    };
    return updated;
  }
  return [{ role: 'system', content: ABSTENTION_INSTRUCTION }, ...messages];
}

const smartRouter = new SmartRouter();

export class UnifiedEngine {
  static async executeStream(
    options: ExecuteOptions,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ): Promise<void> {
    const startTime = Date.now();
    let { provider, model, messages, settings, apiKey, customGatewayUrls, tools } = options;

    // Concurrency check (Phase 1.5)
    const limits = PROVIDER_LIMITS[provider] || { maxConcurrent: 5, maxPerMinute: 60 };
    if (activeConnections[provider] >= limits.maxConcurrent) {
      logger.warn(`[UnifiedEngine] Concurrency limit reached for ${provider}: ${activeConnections[provider]}/${limits.maxConcurrent}`);
      onChunk({ error: `Concurrency limit reached for provider: ${provider}. Please try again shortly.` });
      onComplete();
      return;
    }

    activeConnections[provider]++;

    try {
      // 1. Resolve Provider via Router if necessary
      const apiKeys = await loadKeys();

      if (apiKey) {
        apiKeys[provider] = apiKey;
      }

      if (provider !== 'ollama' && provider !== 'lmstudio' && provider !== 'antigravity-sdk') {
        try {
          const prompt = messages[messages.length - 1]?.content || '';
          const decision = await smartRouter.route(prompt, {
            primary: { provider: provider as any, id: model, name: model, description: '', status: 'ga' },
            fallbacks: [
              { provider: 'gemini', id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: '', status: 'ga' },
              { provider: 'gemini', id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: '', status: 'ga' }
            ]
          }, apiKeys);

          provider = decision.provider;
          model = decision.modelId;
          apiKey = decision.apiKey;
        } catch (err: any) {
          logger.warn('[SmartRouter] Routing failed, falling back to original request:', err.message);
        }
      }

      // Preprocess the last user message off the event loop via worker thread
      const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
      if (lastUserIdx >= 0 && messages[lastUserIdx].content) {
        try {
          const cleaned = await workerPool.preprocessPrompt(messages[lastUserIdx].content);
          messages = messages.map((m, i) =>
            i === lastUserIdx ? { ...m, content: cleaned } : m
          );
        } catch {
          // Worker unavailable — continue
        }
      }

      // 2. Auth validation
      const authResult = Gateway.validateAuth(provider as Provider, model, apiKey);
      if (!authResult.valid) {
        throw new Error(authResult.error);
      }

      const activeKey = apiKey || Gateway.getActiveKey(provider as Provider, apiKey);
      logger.info({ provider, apiKeyLength: apiKey?.length, activeKeyLength: activeKey?.length, activeKeyPrefix: activeKey ? activeKey.substring(0, 10) : 'none' }, '[UnifiedEngine] Resolved activeKey');

      // Token-based history slicing (Phase 5.1)
      const MAX_HISTORY_TOKENS = 80_000;
      let processedMessages = sliceHistoryByTokens(messages, MAX_HISTORY_TOKENS);

      // Prompt pre-processing middleware using Antigravity service (Enabled globally as primary backend handler)
      if (settings?.antigravity !== false && env.ENABLE_ANTIGRAVITY_PREPROCESSING) {
        const userMessages = processedMessages.filter((m) => m.role === 'user');
        if (userMessages.length > 0) {
          const lastUserMessage = userMessages[userMessages.length - 1];
          const originalPrompt = lastUserMessage.content;

          try {
            const port = env.ANTIGRAVITY_PORT || 3003;
            const activeGeminiKey = Gateway.getActiveKey(
              'gemini',
              provider === 'gemini' ? apiKey : undefined
            );

            let domain = 'general';
            if (
              originalPrompt.includes('```') ||
              originalPrompt.includes('function') ||
              originalPrompt.includes('class')
            ) {
              domain = 'coding';
            } else if (
              originalPrompt.toLowerCase().includes('story') ||
              originalPrompt.toLowerCase().includes('creative')
            ) {
              domain = 'creative';
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const preprocessRes = await fetch(`http://127.0.0.1:${port}/preprocess`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: originalPrompt,
                apiKey: activeGeminiKey,
                domain,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (preprocessRes.ok) {
              const data: any = await preprocessRes.json();
              if (data && typeof data.prompt === 'string') {
                const lastUserIdx = processedMessages.map((m) => m.role).lastIndexOf('user');
                if (lastUserIdx >= 0) {
                  processedMessages = [...processedMessages];
                  processedMessages[lastUserIdx] = {
                    ...processedMessages[lastUserIdx],
                    content: data.prompt,
                  };

                  try {
                    const { db } = await import('../db/client.js');
                    const { promptOptimizations } = await import('../db/schema.js');
                    const { randomUUID } = await import('crypto');

                    const optimizationId = randomUUID();
                    await db.insert(promptOptimizations).values({
                      id: optimizationId,
                      originalPrompt,
                      optimizedPrompt: data.prompt,
                      domain: data.domain || domain,
                      version: data.version || 'unknown',
                      timestamp: Date.now(),
                    });

                    // Send as dedicated SSE event (Phase 2.3)
                    onChunk({ type: 'meta', antigravity_id: optimizationId });
                  } catch (dbErr: any) {
                    logger.error({ err: dbErr }, '[Antigravity Middleware] Failed to log optimization:');
                  }
                }
              }
            }
          } catch (err: any) {
            logger.warn({ err }, '[Antigravity Middleware] Prompt preprocessing failed (non-fatal):');
          }
        }
      }

      // Apply Abstention Training
      processedMessages = injectAbstentionInstruction(processedMessages);

      // Apply Prompt Compression
      const MAX_TOKENS = 64000;
      processedMessages = processedMessages.map(m => {
        if (m.role === 'user') {
          return {
            ...m,
            content: compressPrompt(m.content, MAX_TOKENS)
          };
        }
        return m;
      });

      // 3. Response Caching check (Phase 5.5)
      const isToolRequest = !!(tools && tools.length > 0);
      const cacheKey = CacheServer.generateKey({
        provider,
        model,
        prompt: processedMessages[processedMessages.length - 1]?.content || '',
        history: processedMessages,
      });

      if (!isToolRequest) {
        const cached = await CacheServer.get(cacheKey);
        if (cached) {
          logger.info({ cacheKey }, '[UnifiedEngine] Caching hit!');
          onChunk({ chunk: cached });
          onComplete();
          NyxTelemetry.recordRequest(provider, model, Date.now() - startTime, estimateTokens(cached));
          return;
        }
      }

      // 4. Fallback Loop Execution (Phase 4.2)
      // Rank providers: primary, followed by fallbacks if primary fails
      const providersToTry = [{ provider, model }];
      if (provider === 'gemini') {
        const fallbackOllamaModel = env.OLLAMA_FALLBACK_MODEL;
        if (fallbackOllamaModel) {
          providersToTry.push({ provider: 'ollama', model: fallbackOllamaModel });
        }
      }

      let succeeded = false;
      let accumulatedText = '';
      let lastError: any;

      for (const currentProv of providersToTry) {
        try {
          const provKey = currentProv.provider === provider ? activeKey : Gateway.getActiveKey(currentProv.provider as Provider);
          
          await AIEngine.stream(
            {
              provider: currentProv.provider as Provider,
              model: currentProv.model,
              messages: processedMessages,
              apiKey: provKey,
              settings,
              customGatewayUrls,
              tools,
              signal: options.signal,
            },
            (chunkEvent: any) => {
              if (chunkEvent.chunk && chunkEvent.type !== 'thinking') {
                accumulatedText += chunkEvent.chunk;
              }
              onChunk(chunkEvent);
            },
            () => {
              succeeded = true;
            }
          );

          if (succeeded) {
            const durationMs = Date.now() - startTime;
            const tokenCount = estimateTokens(accumulatedText);

            // Record telemetry stats (Phase 4.1)
            NyxTelemetry.recordRequest(currentProv.provider, currentProv.model, durationMs, tokenCount);

            // Cache if eligible (Phase 5.5)
            if (!isToolRequest && tokenCount < 500 && accumulatedText.trim()) {
              await CacheServer.setWithTTL(cacheKey, accumulatedText, currentProv.provider, currentProv.model, 300_000); // 5 minutes
            }

            break; // Break the fallback loop on success
          }
        } catch (err: any) {
          logger.error(`[UnifiedEngine] Provider ${currentProv.provider} failed:`, err.message);
          NyxTelemetry.recordError(currentProv.provider, currentProv.model, err.message || 'Unknown error');
          lastError = err;
          // continue loop to try next provider
        }
      }

      if (!succeeded) {
        throw lastError || new Error('All providers failed to respond');
      }

      onComplete();
    } finally {
      activeConnections[provider]--;
    }
  }
}
