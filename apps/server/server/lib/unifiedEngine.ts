import { Provider, ChatMessage, AISettings, getModelCapabilities } from '@nyx/shared';
import { env } from '../config/env.js';
import { Gateway } from './gateway.js';
import logger from './logger.js';
import { AIEngine } from './aiEngine.js';
import { SmartRouter, smartRouterInstance } from './router.js';
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
  /** Adaptive thinking token budget (M1). Range: 256–24576. Resolved by thinkingBudget.ts. */
  thinkingBudget?: number;
  /** Gemini structured output: forces response to valid JSON. Incompatible with thinking tokens. */
  jsonMode?: boolean;
  /** Gemini response schema for structured JSON output (used with jsonMode). */
  jsonSchema?: Record<string, unknown>;
  /** Gemini native Google Search grounding. Not supported on Gemma models. */
  useGoogleSearch?: boolean;
}


export interface StreamChunk {
  chunk?: string;
  choices?: Array<{ delta: { content: string } }>;
  token?: string;
  error?: string;
  type?: string;
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
  let systemMessage: ChatMessage | null = null;

  // Preserve the first message if it's a system prompt
  if (messages.length > 0 && messages[0].role === 'system') {
    systemMessage = messages[0];
    total += estimateTokens(systemMessage.content || '');
  }
  
  // Iterate backwards from most recent, stopping before the system message
  const stopIdx = systemMessage ? 1 : 0;
  for (let i = messages.length - 1; i >= stopIdx; i--) {
    const msgTokens = estimateTokens(messages[i].content || '');
    if (total + msgTokens > maxTokens) break;
    total += msgTokens;
    result.unshift(messages[i]);
  }
  
  if (systemMessage) {
    result.unshift(systemMessage);
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

const smartRouter = smartRouterInstance;

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
      // ── 1. Keys & Router fast-path ────────────────────────────────────────
      // Load keys from the in-memory 30s TTL cache (no disk I/O on warm path)
      const apiKeys = await loadKeys();

      if (apiKey) {
        apiKeys[provider] = apiKey;
      }

      // Only invoke the full router scoring when the primary provider
      // has no key or is currently marked down. Otherwise return immediately.
      if (provider !== 'ollama' && provider !== 'lmstudio') {
        const hasPrimaryKey = !!(apiKeys[provider] || apiKey)
          || (provider as string) === 'pollinations';
        const isPrimaryDown = smartRouter.isDown(provider as Provider);

        if (!hasPrimaryKey || isPrimaryDown) {
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

      // ── 2. Auth validation ───────────────────────────────────────────────
      const authResult = Gateway.validateAuth(provider as Provider, model, apiKey);
      if (!authResult.valid) {
        throw new Error(authResult.error);
      }

      const activeKey = apiKey || Gateway.getActiveKey(provider as Provider, apiKey);
      logger.info({ provider, apiKeyLength: apiKey?.length, activeKeyLength: activeKey?.length, activeKeyPrefix: activeKey ? activeKey.substring(0, 10) : 'none' }, '[UnifiedEngine] Resolved activeKey');

      // ── 3. Context — caller owns truncation; we just process what we receive ──────
      // NOTE: ChatService already runs ContextOptimizer.compressHistory().
      // Do NOT call sliceHistoryByTokens here — that would be double-processing.
      let processedMessages = [...messages];

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
      const currentPrompt = processedMessages[processedMessages.length - 1]?.content || '';
      const cacheKey = CacheServer.generateKey({
        provider,
        model,
        prompt: currentPrompt,
        history: processedMessages,
      });

      if (!isToolRequest) {
        let cached = await CacheServer.get(cacheKey);
        
        // Semantic Cache Check for single-turn conversations (System + User)
        if (!cached && processedMessages.length <= 2) {
          try {
            const { checkSemanticCache } = await import('./memory/vectorStore.js');
            const semanticCacheKey = await checkSemanticCache(currentPrompt, provider as string, model, 0.95);
            if (semanticCacheKey) {
              cached = await CacheServer.get(semanticCacheKey);
            }
          } catch (e: any) {
            logger.warn('[UnifiedEngine] Semantic Cache check skipped:', e.message);
          }
        }

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
          
          let cacheName: string | undefined;
          let finalMessagesToStream = processedMessages;

          if (currentProv.provider === 'gemini') {
            const historyPrefix = processedMessages.slice(0, -1);
            
            let prefixTokens = 0;
            for (const m of historyPrefix) {
              prefixTokens += Math.ceil((m.content || '').length / 4);
              if (m.images && Array.isArray(m.images)) {
                prefixTokens += m.images.length * 258;
              }
            }

            if (prefixTokens > 32768) {
              try {
                const { GeminiCacheManager } = await import('./geminiCacheManager.js');
                
                const systemIdx = historyPrefix.findIndex(m => m.role === 'system');
                let systemInstruction: string | undefined;
                let messagesForCachingLookup = historyPrefix;
                
                if (systemIdx >= 0) {
                  systemInstruction = historyPrefix[systemIdx].content;
                  messagesForCachingLookup = historyPrefix.filter((_, idx) => idx !== systemIdx);
                }

                const matchingCache = GeminiCacheManager.findMatchingCache(messagesForCachingLookup, currentProv.model, tools);
                
                if (matchingCache) {
                  cacheName = matchingCache.cacheName;
                  const uncachedMessages = messagesForCachingLookup.slice(matchingCache.messageCount);
                  finalMessagesToStream = [...uncachedMessages, processedMessages[processedMessages.length - 1]];
                  logger.info(`[UnifiedEngine] Prefix cache hit! Reusing cache: ${cacheName}. Sending ${finalMessagesToStream.length} uncached messages.`);
                } else {
                  const cacheResult = await GeminiCacheManager.getOrCreateCache(
                    messagesForCachingLookup,
                    systemInstruction,
                    currentProv.model,
                    provKey,
                    tools
                  );
                  cacheName = cacheResult.cacheName;
                  finalMessagesToStream = [processedMessages[processedMessages.length - 1]];
                }
              } catch (cacheErr: any) {
                logger.warn('[UnifiedEngine] Gemini Context Caching failed (falling back to standard stream):', cacheErr.message);
              }
            }
          }

          let ttftMs: number | undefined;

          await AIEngine.stream(
            {
              provider: currentProv.provider as Provider,
              model: currentProv.model,
              messages: finalMessagesToStream,
              apiKey: provKey,
              settings,
              customGatewayUrls,
              tools,
              signal: options.signal,
              cachedContent: cacheName,
            },
            (chunkEvent: any) => {
              // Record TTFT on the very first real text chunk
              if (ttftMs === undefined && (chunkEvent.chunk || typeof chunkEvent === 'string')) {
                ttftMs = Date.now() - startTime;
                NyxTelemetry.recordTTFT(currentProv.provider, currentProv.model, ttftMs);
              }
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

            // Record telemetry stats with TTFT (Phase 4.1)
            NyxTelemetry.recordRequest(currentProv.provider, currentProv.model, durationMs, tokenCount, ttftMs);

            // Cache if eligible (Phase 5.5)
            if (!isToolRequest && tokenCount < 500 && accumulatedText.trim()) {
              await CacheServer.setWithTTL(cacheKey, accumulatedText, currentProv.provider, currentProv.model, 300_000); // 5 minutes
              
              if (processedMessages.length <= 2) {
                try {
                  const { storeSemanticCache } = await import('./memory/vectorStore.js');
                  await storeSemanticCache(currentPrompt, cacheKey, currentProv.provider, currentProv.model);
                } catch (e: any) {
                  // ignore error
                }
              }
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
