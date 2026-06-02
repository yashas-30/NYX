/**
 * @file src/features/chat/hooks/useChatPipeline.ts
 * @description Production-grade AI streaming pipeline with batched updates,
 *   backpressure handling, multi-provider fallback, and Claude/Kimi-parity
 *   streaming architecture.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChatMessage,
  TelemetryMetrics,
  AISettings,
  StreamEvent,
  ToolCall,
} from '@src/infrastructure/types';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import {
  analyzePrompt,
  PromptAnalysis,
  createConversationState,
  updateConversationState,
  ConversationState,
} from '@src/core/services/promptClassifier';
import { ChatAgentWithTools } from '@src/core/agents/chatAgentWithTools';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { triggerMemoryCommit } from '@src/infrastructure/api/coderApi';
import { AIService, countTokens } from '@src/core/services/ai.service';
import { toast } from '@src/shared/components/ui/sonner';
import { ContextManager } from '../utils/ContextManager';
import { formatProviderError } from '@src/infrastructure/api/streamParser';
import { useNyxStore } from '@src/shared/store/useNyxStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatPipelineProps {
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  history: ChatMessage[];
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
  logRollout?: (
    agentType: 'chat' | 'coder',
    task: string,
    response: string,
    spans?: any[],
    initialReward?: number | null
  ) => string;
  webSearchEnabled?: boolean;
  onStream?: (event: StreamEvent) => void;
  maxRetries?: number;
}

interface Citation {
  url?: string;
  title?: string;
  snippet?: string;
  id?: string;
  source?: string;
  quote?: string;
}

interface StreamChunk {
  type:
    | 'text'
    | 'thinking'
    | 'reasoning'
    | 'tool_call'
    | 'citation'
    | 'metrics'
    | 'finish'
    | 'done'
    | 'artifact'
    | 'error';
  content?: string;
  metadata?: any;
}

interface PipelineState {
  isLoading: boolean;
  isSearching: boolean;
  isThinking: boolean;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'stopped' | null;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  onRetry?: (attempt: number, delay: number, error: Error) => void
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Never retry on abort — propagate immediately
      if (error.name === 'AbortError') throw error;

      const isRetryable = /429|503|timeout|network|econnreset|unavailable|rate.limit/i.test(
        error.message || ''
      );

      if (!isRetryable || attempt > maxRetries) throw lastError;

      const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 10000);
      onRetry?.(attempt, delay, lastError);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Main Hook
// ---------------------------------------------------------------------------

export const useChatPipeline = ({
  models,
  apiKeys,
  modelSettings,
  trackUsage,
  history,
  updateHistory,
  updateMetrics,
  getSuggestions,
  setSuggestedPrompts,
  lightningEnabled,
  lightningDirectives,
  logRollout,
  webSearchEnabled = false,
  onStream,
  maxRetries = 2,
}: ChatPipelineProps) => {
  const [state, setState] = useState<PipelineState>({
    isLoading: false,
    isSearching: false,
    isThinking: false,
    finishReason: null,
  });

  const controllerRef = useRef<AbortController | null>(null);
  const historySnapshotRef = useRef<ChatMessage[]>([]);
  const isMountedRef = useRef(true);
  const streamMetricsRef = useRef<TelemetryMetrics | null>(null);
  const conversationStateRef = useRef<ConversationState>(createConversationState());
  const onStreamRef = useRef(onStream);
  useEffect(() => {
    onStreamRef.current = onStream;
  }, [onStream]);

  // Keep snapshot in sync without triggering re-renders
  useEffect(() => {
    historySnapshotRef.current = history;
  }, [history]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Safe history update
  // -------------------------------------------------------------------------

  const safeUpdateHistory = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      if (!isMountedRef.current) return;

      updateHistory((prev) => {
        const cloned = prev.map((m) => ({
          ...m,
          toolCalls: m.toolCalls ? m.toolCalls.map((t) => ({ ...t })) : undefined,
          citations: m.citations ? [...m.citations] : undefined,
          artifacts: m.artifacts ? [...m.artifacts] : undefined,
        }));
        const nextHistory = updater(cloned);
        historySnapshotRef.current = nextHistory;
        return nextHistory;
      });
    },
    [updateHistory]
  );

  // -------------------------------------------------------------------------
  // Stream processor (handles all chunk types)
  // -------------------------------------------------------------------------

  const processStream = useCallback(
    async (
      generator: AsyncGenerator<StreamChunk>,
      signal: AbortSignal,
      timeoutMs: number = 60000
    ): Promise<{ text: string; metrics: TelemetryMetrics | null; finishReason: string }> => {
      let accumulatedText = '';
      let accumulatedReasoning = '';
      const toolCallsMap = new Map<string, ToolCall>();
      const citations: Citation[] = [];
      const artifacts: any[] = [];
      let finalMetrics: TelemetryMetrics | null = null;
      let finishReason = 'stop';
      let hasReceivedFirstChunk = false;
      const streamStartTime = Date.now();

      try {
        for await (const chunk of generator) {
          hasReceivedFirstChunk = true;

          if (signal.aborted) break;

          if (!chunk || !chunk.type) {
            console.warn('[Chat Pipeline] Invalid chunk received:', chunk);
            continue;
          }

          switch (chunk.type) {
            case 'text': {
              const delta = chunk.content || '';
              accumulatedText += delta;

              safeUpdateHistory((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    content: accumulatedText,
                  };
                }
                return next;
              });

              onStreamRef.current?.({
                type: 'text',
                content: accumulatedText,
              } as any);
              break;
            }

            case 'thinking':
            case 'reasoning': {
              const delta = chunk.content || '';
              accumulatedReasoning += delta;

              safeUpdateHistory((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    reasoning: accumulatedReasoning,
                  };
                }
                return next;
              });

              onStreamRef.current?.({
                type: 'thinking',
                content: accumulatedReasoning,
              } as any);
              break;
            }

            case 'tool_call': {
              const tc = chunk.metadata as ToolCall;
              if (!tc?.id) break;

              const existing = toolCallsMap.get(tc.id);
              if (existing) {
                existing.function.arguments += tc.function.arguments || '';
              } else {
                toolCallsMap.set(tc.id, {
                  id: tc.id,
                  type: 'function',
                  index: tc.index || toolCallsMap.size,
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                  },
                });
              }

              const calls = Array.from(toolCallsMap.values());
              safeUpdateHistory((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    toolCalls: calls,
                  };
                }
                return next;
              });

              onStreamRef.current?.({
                type: 'tool_use',
                content: JSON.stringify(calls),
              } as any);
              break;
            }

            case 'citation': {
              const cite = chunk.metadata as Citation;
              if (cite) {
                citations.push(cite);
                safeUpdateHistory((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      citations: [...citations],
                    };
                  }
                  return next;
                });
              }
              break;
            }

            case 'artifact': {
              const artifact = chunk.metadata;
              if (artifact) {
                artifacts.push(artifact);
                safeUpdateHistory((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      artifacts: [...artifacts],
                    };
                  }
                  return next;
                });
              }
              break;
            }

            case 'error': {
              finishReason = 'error';
              throw new Error(chunk.content || 'Stream error from agent');
            }

            case 'metrics': {
              if (chunk.metadata) {
                const meta = chunk.metadata as any;
                const tokens = meta.totalTokens || meta.tokens || meta.total_tokens || 0;
                const latency = meta.latencyMs || meta.latency || 0;
                const tps =
                  meta.tokensPerSecond || meta.tps || (latency > 0 ? tokens / (latency / 1000) : 0);

                const mappedMetrics: TelemetryMetrics = {
                  latency,
                  tokens,
                  tps,
                  ttft: meta.ttft,
                };

                finalMetrics = mappedMetrics;
                streamMetricsRef.current = mappedMetrics;
                updateMetrics(mappedMetrics);
              }
              break;
            }

            case 'done':
            case 'finish': {
              if (chunk.metadata?.finish_reason) {
                finishReason = chunk.metadata.finish_reason;
              }
              break;
            }
            default:
              console.warn(`[Chat Pipeline] Unknown chunk type received: ${(chunk as any).type}`);
              break;
          }
        }
      } catch (err: any) {
        const isAbort = err?.name === 'AbortError' || signal.aborted;
        if (!isAbort) {
          console.error('[Chat Pipeline] Stream processing error:', err);
        }
        throw err;
      }

      return { text: accumulatedText, metrics: finalMetrics, finishReason };
    },
    [safeUpdateHistory, updateMetrics, onStream]
  );

  // -------------------------------------------------------------------------
  // Web search with progress
  // -------------------------------------------------------------------------

  const gatherSearchContext = useCallback(
    async (
      agent: ChatAgentWithTools,
      prompt: string,
      analysis: PromptAnalysis,
      signal: AbortSignal
    ): Promise<string> => {
      // Skip web search if disabled
      if (!webSearchEnabled || !agent.shouldSearchWeb(prompt, analysis)) return '';

      setState((s) => ({ ...s, isSearching: true }));

      try {
        const searchPromise = withRetry(
          () => agent.gatherContext(prompt, signal),
          maxRetries,
          (attempt, delay) => {
            console.log(`[Chat Pipeline] Search retry ${attempt} in ${delay}ms`);
          }
        );

        // Timeout after 10 seconds max (instead of 30) to prevent hanging
        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Web search timed out')), 10000)
        );

        return await Promise.race([searchPromise, timeoutPromise]);
      } catch (error: any) {
        console.warn('[Chat Pipeline] Search failed:', error.message);
        // Don't show error toast - just continue without search context
        return '';
      } finally {
        if (isMountedRef.current) {
          setState((s) => ({ ...s, isSearching: false }));
        }
      }
    },
    [maxRetries, webSearchEnabled]
  );

  // -------------------------------------------------------------------------
  // Main chat execution
  // -------------------------------------------------------------------------

  const runChat = useCallback(
    async (prompt: string, images?: { name: string; mimeType: string; data: string }[]) => {
      // Prompt sanitization (prevent null byte injection and normalize whitespace)
      const sanitizedPrompt = prompt.replace(/\0/g, '').trim();

      const nyxModel = models['nyx'];
      if ((!sanitizedPrompt && (!images || images.length === 0)) || !nyxModel) {
        console.warn('[Chat Pipeline] Missing prompt or model:', {
          prompt: !!sanitizedPrompt,
          nyxModel,
        });
        return;
      }

      console.log('[Chat Pipeline] Starting chat with model:', nyxModel);

      const nyxProvider = detectProvider(nyxModel);
      const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys) || '';

      console.log('[Chat Pipeline] Provider:', nyxProvider, 'Has API key:', !!nyxApiKey);

      // Cancel any existing request
      if (controllerRef.current) {
        controllerRef.current.abort();
      }

      const controller = new AbortController();
      controllerRef.current = controller;

      // Quick health check for backend
      try {
        const healthRes = await fetch('/api/v1/health', { signal: AbortSignal.timeout(5000) });
        if (!healthRes.ok) {
          console.warn('[Chat Pipeline] Backend health check failed');
          toast.error('Backend server is not responding. Please ensure the server is running.');
          return;
        }
      } catch (healthErr: any) {
        if (healthErr.name !== 'AbortError') {
          console.warn('[Chat Pipeline] Backend health check error:', healthErr);
          toast.error('Cannot reach backend server. Please start the server first.');
          return;
        }
      }

      try {
        // Validate API key early
        if (!nyxApiKey && nyxProvider !== 'nyx-native') {
          throw new Error(
            `${nyxProvider} API key not found. Please add your API key in Settings before using this model.`
          );
        }

        console.log('[Chat Pipeline] Starting chat initialization...');

        // Reset state
        setState({
          isLoading: true,
          isSearching: false,
          isThinking: false,
          finishReason: null,
        });
        streamMetricsRef.current = null;
        setSuggestedPrompts([]);
        updateMetrics({ latency: 0, tokens: 0, tps: 0 });

        const startTime = Date.now();
        // 1. Add user message
        const userMsg: ChatMessage = {
          role: 'user',
          content: sanitizedPrompt,
          timestamp: Date.now(),
          images,
        };

        safeUpdateHistory((prev) => [...prev, userMsg]);

        // 2. Analyze prompt
        const analysis = analyzePrompt(sanitizedPrompt, conversationStateRef.current);
        conversationStateRef.current = updateConversationState(
          conversationStateRef.current,
          analysis
        );

        // 3. Add loading assistant message
        safeUpdateHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            status: 'loading',
          },
        ]);

        // Optimize conversation history
        const optimizedHistory = ContextManager.optimizeContextWindow(
          historySnapshotRef.current,
          8192,
          5
        );

        // Compress prompt to mitigate context overflows if it's too large
        const compressedPrompt = AIService.compressPrompt(sanitizedPrompt, 50000);

        // 4. Initialize agent with snapshot (not live ref)
        const agent = new ChatAgentWithTools({
          modelId: nyxModel,
          provider: nyxProvider,
          apiKey: nyxApiKey,
          settings: modelSettings,
          history: optimizedHistory,
          lightningDirectives: lightningEnabled ? lightningDirectives : undefined,
          webSearchEnabled: false,
          conversationState: conversationStateRef.current,
        });

        // 5. Gather search context (non-blocking UI)
        const searchContext = await gatherSearchContext(
          agent,
          compressedPrompt,
          analysis,
          controller.signal
        );

        // 6. Stream response with timeout protection and Execution Mode handling
        const executionMode = useNyxStore.getState().executionMode || 'standard';
        let generator: AsyncGenerator<any>;

        if (executionMode === 'standard') {
          generator = agent.streamResponse(
            compressedPrompt,
            analysis,
            controller.signal,
            searchContext,
            images
          ) as AsyncGenerator<any>;
        } else {
          // Adapter generator for parallel, ensemble, ab-test
          generator = (async function* () {
            yield { type: 'thinking', content: `Starting ${executionMode} execution...` };
            try {
              const baseOptions = { apiKey: nyxApiKey, settings: modelSettings };
              let responseText = '';
              let metadata: any = { latency: 0, tokens: 0, tps: 0 };

              // We'll use nyxModel as primary, and optionally a fast model for the secondary config
              const configs = [
                { modelId: nyxModel, provider: nyxProvider },
                { modelId: 'gemini-2.5-flash', provider: 'gemini' },
              ];

              if (executionMode === 'parallel') {
                const results = await AIService.executeParallel(
                  configs,
                  compressedPrompt,
                  baseOptions
                );
                responseText = results
                  .map((r) => `### Response from ${r.model}:\n${r.text}`)
                  .join('\n\n---\n\n');
                metadata = results[0]?.metrics || metadata;
              } else if (executionMode === 'ensemble') {
                const synthesizer = { modelId: nyxModel, provider: nyxProvider };
                const res = await AIService.executeEnsemble(
                  configs,
                  synthesizer,
                  compressedPrompt,
                  baseOptions
                );
                responseText = res.text;
                metadata = res.metrics || metadata;
              } else if (executionMode === 'ab-test') {
                const variants = configs.map((c) => ({ weight: 0.5, config: c }));
                const res = await AIService.executeABTest(compressedPrompt, variants, baseOptions);
                responseText = `[A/B Test Chose: ${res.model}]\n\n${res.text}`;
                metadata = res.metrics || metadata;
              }

              yield { type: 'text', content: responseText };
              if (metadata) yield { type: 'metrics', metadata };
              yield { type: 'done' };
            } catch (err: any) {
              yield { type: 'error', content: err.message };
            }
          })();
        }

        // Wrap processStream with timeout
        let streamTimeoutHandle: NodeJS.Timeout | null = null;
        const streamTimeoutPromise = new Promise<any>((_, reject) => {
          streamTimeoutHandle = setTimeout(() => {
            controller.abort();
            reject(
              new Error('Stream response timeout after 60 seconds - no data received from model')
            );
          }, 60000);
        });

        try {
          const streamPromise = processStream(generator, controller.signal, 60000);
          const { text, metrics, finishReason } = await Promise.race([
            streamPromise,
            streamTimeoutPromise,
          ]);

          // Clear timeout since we got a response
          if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle);

          // 7. Finalize assistant message
          const finalMetrics: TelemetryMetrics = metrics || {
            latency: Date.now() - startTime,
            tokens: countTokens(text),
            tps: 0,
          };

          if (finalMetrics.latency > 0 && finalMetrics.tokens > 0) {
            finalMetrics.tps = Math.round(finalMetrics.tokens / (finalMetrics.latency / 1000));
          }

          const enrichedMetrics = {
            ...finalMetrics,
            finishReason,
          };

          safeUpdateHistory((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: text,
                status: finishReason === 'error' ? 'error' : 'success',
                metrics: enrichedMetrics,
                reasoning: last.reasoning || undefined,
                toolCalls: last.toolCalls || undefined,
                citations: last.citations || undefined,
                artifacts: last.artifacts || undefined,
              };
            }
            return next;
          });

          updateMetrics(finalMetrics);
          trackUsage(nyxProvider, finalMetrics.tokens);

          // 8. Log rollout
          if (logRollout && text) {
            logRollout(
              'chat',
              sanitizedPrompt,
              text,
              finalMetrics
                ? [
                    {
                      name: 'chat_agent_inference',
                      type: 'llm_call',
                      input: sanitizedPrompt,
                      output: text,
                      durationMs: finalMetrics.latency,
                      tokensUsed: finalMetrics.tokens,
                      finishReason,
                    },
                  ]
                : []
            );
          }

          // 9. Update suggestions
          getSuggestions(historySnapshotRef.current);

          // 10. Fire-and-forget memory commit
          if (text.trim()) {
            const memoryPromise = triggerMemoryCommit({
              prompt: sanitizedPrompt,
              response: text,
              provider: nyxProvider,
              modelId: nyxModel,
              agentType: 'chat',
            });

            // Don't await — but catch errors
            memoryPromise.catch((err) => {
              console.warn('[Chat Pipeline] Memory commit failed:', err);
            });

            // Set timeout to prevent hanging if component unmounts
            const memoryTimeout = setTimeout(() => {
              console.warn('[Chat Pipeline] Memory commit timeout');
            }, 30000);

            memoryPromise.finally(() => clearTimeout(memoryTimeout));
          }

          setState((s) => ({ ...s, finishReason: finishReason as any }));
        } catch (timeoutErr: any) {
          // Stream timeout or Promise.race error
          if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle);
          throw timeoutErr;
        }
      } catch (error: any) {
        const isAborted = error?.name === 'AbortError' || controller.signal.aborted;

        if (!isAborted) console.error('[Chat Pipeline] Error:', error);

        // Show error toast to user immediately
        if (!isAborted) {
          const errorMsg = formatProviderError(
            error.message ||
              'Error: Generation failed. Please check your model settings or connection.'
          );
          toast.error(errorMsg);
        }

        safeUpdateHistory((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            // Preserve any partial content
            const partialContent = last.content || '';
            next[next.length - 1] = {
              ...last,
              status: isAborted ? 'stopped' : 'error',
              content:
                partialContent ||
                (isAborted
                  ? 'Generation stopped.'
                  : formatProviderError(
                      error.message ||
                        'Error: Generation failed. Please check your model settings or connection.'
                    )),
              metrics: {
                ...(last.metrics || {}),
                finishReason: isAborted ? 'stopped' : 'error',
              },
            };
          }
          return next;
        });

        setState((s) => ({
          ...s,
          finishReason: isAborted ? 'stopped' : 'error',
        }));
      } finally {
        if (isMountedRef.current && controllerRef.current === controller) {
          controllerRef.current = null;
          setState((s) => ({
            ...s,
            isLoading: false,
            isSearching: false,
            isThinking: false,
          }));
        }
      }
    },
    [
      models,
      apiKeys,
      modelSettings,
      trackUsage,
      safeUpdateHistory,
      updateMetrics,
      setSuggestedPrompts,
      getSuggestions,
      lightningEnabled,
      lightningDirectives,
      logRollout,
      maxRetries,
      gatherSearchContext,
      processStream,
    ]
  );

  // -------------------------------------------------------------------------
  // Stop generation
  // -------------------------------------------------------------------------

  const stopChat = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;

    setState({
      isLoading: false,
      isSearching: false,
      isThinking: false,
      finishReason: 'stopped',
    });
  }, []);

  return {
    isLoading: state.isLoading,
    isSearching: state.isSearching,
    isThinking: state.isThinking,
    finishReason: state.finishReason,
    runChat,
    stopChat,
  };
};
