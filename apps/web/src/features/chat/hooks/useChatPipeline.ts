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
} from '@src/features/ai/services/promptClassifier';

import { TokioOrchestratorService } from '../../agents/tokioOrchestrator.service';

import { triggerMemoryCommit } from '@src/infrastructure/api/coderApi';
import { AIService, countTokens } from '@src/features/ai/services/ai.service';
import { toast } from '@src/shared/components/ui/sonner';
import { ContextManager } from '../utils/ContextManager';
import { formatProviderError } from '@src/infrastructure/api/streamParser';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { AVAILABLE_MODELS } from '@src/shared/config/models';

// Tauri MCP imports
import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Execution Mode Helper Functions
// ---------------------------------------------------------------------------

function extractModelsFromPrompt(prompt: string): typeof AVAILABLE_MODELS {
  const lower = prompt.toLowerCase();
  const matched = new Set<string>();
  const results: typeof AVAILABLE_MODELS = [];

  const mappings = [
    { keywords: ['claude 3.7', 'claude 37', 'claude-3.7', '3.7 sonnet', '3.7-sonnet'], modelId: 'claude-3-7-sonnet-20250219' },
    { keywords: ['claude 3.5', 'claude-3.5', '3.5 sonnet', '3.5-sonnet', 'sonnet'], modelId: 'claude-3-5-sonnet-20241022' },
    { keywords: ['haiku', 'claude-3.5-haiku', '3.5 haiku'], modelId: 'claude-3-5-haiku-20241022' },
    { keywords: ['gpt-4o-mini', 'gpt 4o mini', '4o mini', 'gpt-4o mini'], modelId: 'gpt-4o-mini' },
    { keywords: ['gpt-4o', 'gpt 4o', 'gpt4o', 'gpt-4'], modelId: 'gpt-4o' },
    { keywords: ['o3-mini', 'o3 mini', 'o3'], modelId: 'o3-mini' },
    { keywords: ['o1-mini', 'o1 mini', 'o1'], modelId: 'o1-mini' },

    { keywords: ['gemini 3.5', 'gemini-3.5', 'gemini 3.5 flash'], modelId: 'gemini-3.5-flash' },
    { keywords: ['gemini 3.1', 'gemini 3.1 flash', 'gemini-3.1'], modelId: 'gemini-3.1-flash-lite' },
    { keywords: ['gemma 4', 'gemma-4', 'gemma4'], modelId: 'gemma-4-31b-it' },
    { keywords: ['llama 3.3', 'llama-3.3'], modelId: 'meta-llama/llama-3.3-70b-instruct' },
  ];

  for (const map of mappings) {
    if (map.keywords.some(kw => lower.includes(kw))) {
      const model = AVAILABLE_MODELS.find(m => m.id === map.modelId);
      if (model && !matched.has(model.id)) {
        matched.add(model.id);
        results.push(model);
      }
    }
  }

  if (results.length < 2) {
    const routingRules: { keywords: string[], modelId: string }[] = [
      { keywords: ['gemini', 'google'], modelId: 'gemini-3.5-flash' }
    ];
    for (const map of routingRules) {
      if (map.keywords.some(kw => lower.includes(kw))) {
        const model = AVAILABLE_MODELS.find(m => m.id === map.modelId);
        if (model && !matched.has(model.id)) {
          matched.add(model.id);
          results.push(model);
        }
      }
    }
  }

  return results;
}

function getCandidatesForExecution(
  promptModels: typeof AVAILABLE_MODELS,
  currentModelId: string,
  currentProvider: string
): { modelId: string; provider: string }[] {
  if (promptModels.length >= 2) {
    return promptModels.map(m => ({ modelId: m.id, provider: m.provider }));
  }

  return [{ modelId: currentModelId, provider: currentProvider }];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatPipelineProps {
  models: Record<'nyx', string>;
  // fallow-ignore-next-line code-duplication
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
    initialReward?: number | null,
    antigravityId?: string
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
    | 'tool_start'
    | 'tool_running'
    | 'tool_done'
    | 'tool_error'
    | 'tool_approval_required'
    | 'citation'
    | 'metrics'
    | 'finish'
    | 'done'
    | 'artifact'
    | 'error'
    | 'meta';
  content?: string;
  error?: string;
  metadata?: any;
  tool_call?: any;
  name?: string;
  result?: any;
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
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    isMountedRef.current = true;
    workerRef.current = new Worker(new URL('../workers/streamProcessor.worker.ts', import.meta.url), { type: 'module' });
    return () => {
      isMountedRef.current = false;
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
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
        if (prev.length === 0) return updater([]);
        
        // SOTA Optimization (Claude Parity): Instead of O(N^2) deep cloning of the entire 
        // conversation array on every chunk, we shallow clone the array and only deep clone 
        // the VERY LAST message (which is the only one actively streaming/mutating).
        const next = [...prev];
        const lastIdx = next.length - 1;
        const lastMsg = next[lastIdx];
        
        next[lastIdx] = {
          ...lastMsg,
          toolCalls: lastMsg.toolCalls ? [...lastMsg.toolCalls] : undefined,
          citations: lastMsg.citations ? [...lastMsg.citations] : undefined,
          artifacts: lastMsg.artifacts ? [...lastMsg.artifacts] : undefined,
        };
        
        const nextHistory = updater(next);
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
      timeoutMs: number = 60000,
      onFirstChunk?: () => void
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

      // Web Worker Setup
      const worker = workerRef.current || new Worker(new URL('../workers/streamProcessor.worker.ts', import.meta.url), { type: 'module' });
      if (!workerRef.current) workerRef.current = worker;
      worker.postMessage({ type: 'reset' });

      let resolveSync: (() => void) | null = null;
      const syncPromise = new Promise<void>((resolve) => {
        resolveSync = resolve;
      });

      // If the worker crashes, resolve so we don't hang forever
      worker.onerror = (err) => {
        console.error('[Chat Pipeline] Stream worker error:', err);
        resolveSync?.();
      };

      worker.onmessage = (event) => {
        if (event.data.type === 'update') {
          const { text, reasoning, blocks, originalChunk, isDone } = event.data.payload;
          const textChanged = text !== accumulatedText;
          const reasoningChanged = reasoning !== accumulatedReasoning;
          
          accumulatedText = text;
          accumulatedReasoning = reasoning;
          
          safeUpdateHistory((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            const last = next[lastIdx];
            if (last?.role === 'assistant') {
              // Parse streaming artifacts at end-of-stream only to optimize regex runtime
              let parsedArtifacts: any[] = [];
              if (isDone || originalChunk?.type === 'done' || originalChunk?.type === 'finish') {
                const seenIds = new Set<string>();

                // 1. Parse explicit <nyx_artifact> tags
                const artifactRegex = /<nyx_artifact\s+id="([^"]+)"\s+title="([^"]+)"\s+type="([^"]+)"(?:\s+language="([^"]+)")?>([\s\S]*?)(?:<\/nyx_artifact>|$)/g;
                let match;
                while ((match = artifactRegex.exec(text)) !== null) {
                  const id = match[1];
                  seenIds.add(id);
                  parsedArtifacts.push({
                    id,
                    title: match[2],
                    type: match[3],
                    language: match[4] || match[3],
                    content: match[5],
                  });
                }

                // 2. Auto-detect standard markdown code blocks (HTML, React, Python, CSS, JS, TS, SVG, Mermaid)
                const markdownCodeBlockRegex = /```(html|react|tsx|jsx|python|py|javascript|js|typescript|ts|css|svg|mermaid)\b([\s\S]*?)(?:```|$)/g;
                let blockIndex = 1;
                while ((match = markdownCodeBlockRegex.exec(text)) !== null) {
                  const lang = match[1];
                  const content = match[2];
                  
                  // Ignore small snippets unless they are renderable structures
                  if (content.trim().length < 40 && !['html', 'svg', 'mermaid'].includes(lang)) {
                    continue;
                  }

                  // Check if this block is already captured inside explicit artifacts to avoid duplication
                  const alreadyCaptured = parsedArtifacts.some(
                    (art) =>
                      art.content.includes(content.trim()) ||
                      content.trim().includes(art.content.trim())
                  );
                  if (alreadyCaptured) {
                    continue;
                  }

                  const id = `auto-code-${blockIndex++}`;
                  let title = 'Snippet';
                  if (lang === 'html') title = 'HTML Page';
                  else if (['react', 'tsx', 'jsx'].includes(lang)) title = 'React Component';
                  else if (['python', 'py'].includes(lang)) title = 'Python Script';
                  else if (lang === 'mermaid') title = 'Mermaid Diagram';
                  else if (lang === 'svg') title = 'Vector Graphic';
                  else if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) title = 'Source Code';
                  else if (lang === 'css') title = 'CSS Stylesheet';

                  parsedArtifacts.push({
                    id,
                    title,
                    type: ['react', 'tsx', 'jsx'].includes(lang) ? 'react' : (lang === 'py' ? 'python' : lang),
                    language: lang,
                    content: content.trim(),
                  });
                }
              }

              next[lastIdx] = {
                ...last,
                content: text,
                reasoning: reasoning !== undefined ? reasoning : last.reasoning,
                blocks: blocks || [],
                artifacts: parsedArtifacts.length ? parsedArtifacts : (last.artifacts || []),
              } as any;
            }
            return next;
          });

          if (textChanged) {
             onStreamRef.current?.({ type: 'text', content: text } as any);
          }
          if (reasoningChanged) {
             onStreamRef.current?.({ type: 'thinking', content: reasoning } as any);
          }
          
          if (
            originalChunk?.type === 'tool_call' || 
            originalChunk?.type === 'tool_result'
          ) {
             onStreamRef.current?.(originalChunk);
          }
        } else if (event.data.type === 'sync_done') {
          resolveSync?.();
        }
      };

      try {
        for await (const chunk of generator) {
          if (!hasReceivedFirstChunk) {
            hasReceivedFirstChunk = true;
            onFirstChunk?.();
          }

          if (signal.aborted) break;

          if (!chunk || !chunk.type) {
            console.warn('[Chat Pipeline] Invalid chunk received:', chunk);
            continue;
          }

          // Send to worker for processing
          worker.postMessage({ type: 'chunk', payload: chunk });

          switch (chunk.type) {
            case 'text': 
            case 'thinking':
            case 'reasoning':
              // Handled by worker
              break;

            case 'tool_start': {
              const tc = chunk.tool_call;
              if (!tc?.id) break;

              toolCallsMap.set(tc.id, {
                id: tc.id,
                type: 'function',
                index: toolCallsMap.size,
                function: {
                  name: tc.name || '',
                  arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
                },
                status: 'pending',
              });

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

            case 'tool_running': {
              const name = chunk.name;
              // Find the latest pending tool with this name
              const calls = Array.from(toolCallsMap.values());
              const target = calls.slice().reverse().find(c => c.function?.name === name && c.status === 'pending');
              if (target) {
                target.status = 'running';
                toolCallsMap.set(target.id, target);
                
                safeUpdateHistory((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      toolCalls: Array.from(toolCallsMap.values()),
                    };
                  }
                  return next;
                });
              }
              break;
            }

            case 'tool_done': {
              const name = chunk.name;
              const result = chunk.result;
              const calls = Array.from(toolCallsMap.values());
              const target = calls.slice().reverse().find(c => c.function?.name === name && c.status === 'running');
              if (target) {
                target.status = 'success';
                target.result = result;
                toolCallsMap.set(target.id, target);
                
                safeUpdateHistory((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      toolCalls: Array.from(toolCallsMap.values()),
                    };
                  }
                  return next;
                });
              }
              break;
            }

            case 'tool_error': {
              const name = chunk.name;
              const error = chunk.error;
              const calls = Array.from(toolCallsMap.values());
              const target = calls.slice().reverse().find(c => c.function?.name === name && c.status === 'running');
              if (target) {
                target.status = 'error';
                target.result = error;
                toolCallsMap.set(target.id, target);
                
                safeUpdateHistory((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      toolCalls: Array.from(toolCallsMap.values()),
                    };
                  }
                  return next;
                });
              }
              break;
            }

            case 'tool_call': {
              const tc = chunk.metadata as any;
              if (!tc?.id && !tc?.toolCallId) break;

              const tcId = tc.id || tc.toolCallId;
              const existing = toolCallsMap.get(tcId);
              if (existing) {
                existing.function.arguments += tc.function?.arguments || tc.args || '';
              } else {
                toolCallsMap.set(tcId, {
                  id: tcId,
                  type: 'function',
                  index: tc.index || toolCallsMap.size,
                  function: {
                    name: tc.function?.name || tc.name || tc.toolName || '',
                    arguments: tc.function?.arguments || tc.args || '',
                  },
                });
              }

              // fallow-ignore-next-line code-duplication
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
                // fallow-ignore-next-line code-duplication
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
              if (artifact && artifact.id) {
                const idx = artifacts.findIndex((a) => a.id === artifact.id);
                if (idx >= 0) {
                  artifacts[idx] = { ...artifacts[idx], ...artifact };
                } else {
                  artifacts.push(artifact);
                }
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

            case 'tool_approval_required': {
              const approvalPayload = {
                approvalId: (chunk as any).approvalId || chunk.metadata?.approvalId || '',
                tool: (chunk as any).tool || chunk.name || '',
                input: (chunk as any).input || chunk.metadata?.input || {},
              };
              safeUpdateHistory((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    pendingApproval: approvalPayload,
                  };
                }
                return next;
              });
              break;
            }

            case 'error': {
              finishReason = 'error';
              throw new Error(chunk.error || chunk.content || 'Stream error from agent');
            }

            case 'metrics': {
              // fallow-ignore-next-line code-duplication
              if (chunk.metadata) {
                const meta = chunk.metadata as any;
                // fallow-ignore-next-line code-duplication
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

            case 'meta': {
              const metaId = (chunk as any).antigravity_id || chunk.metadata?.antigravity_id;
              if (metaId) {
                safeUpdateHistory((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === 'assistant') {
                    next[next.length - 1] = {
                      ...last,
                      metadata: {
                        ...(last.metadata || {}),
                        antigravity_id: metaId,
                      },
                    };
                  }
                  return next;
                });
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

        // Wait for worker to finish processing all chunks
        worker.postMessage({ type: 'sync' });
        await Promise.race([
          syncPromise,
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch (err: any) {
        const isAbort = err?.name === 'AbortError' || signal.aborted;
        if (!isAbort) {
          console.error('[Chat Pipeline] Stream processing error:', err);
        }
        throw err;
      } finally {
        // Do not terminate, we reuse the worker!
      }

      return { text: accumulatedText, metrics: finalMetrics, finishReason };
    },
    [safeUpdateHistory, updateMetrics, onStream]
  );

  // -------------------------------------------------------------------------
  // Web search with progress (REMOVED - Handled by backend tools to avoid blocking)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Main chat execution
  // -------------------------------------------------------------------------

  const runChat = useCallback(
    async (prompt: string, images?: { name: string; mimeType: string; data: string }[], options?: { agentType?: 'chat' | 'coder', skipUserMessage?: boolean, modelOverride?: string, systemPromptAddon?: string, enableTools?: boolean, expectedComplexity?: number }) => {
      // Prompt sanitization (prevent null byte injection and normalize whitespace)
      const sanitizedPrompt = prompt.replace(/\0/g, '').trim();

      const nyxModel = options?.modelOverride || models['nyx'];
      if ((!sanitizedPrompt && (!images || images.length === 0)) || !nyxModel) {
        console.warn('[Chat Pipeline] Missing prompt or model:', {
          prompt: !!sanitizedPrompt,
          nyxModel,
        });
        return;
      }


      const nyxProvider = detectProvider(nyxModel);
      const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys) || '';


      const modelConfig = AVAILABLE_MODELS.find(m => m.id === nyxModel);
      if (modelConfig && modelConfig.limits) {
        const limitCheck = useUsageStore.getState().checkLimit(nyxModel, nyxApiKey, modelConfig.limits);
        if (limitCheck !== 'ok') {
          const limitNames = {
            rpm: 'requests per minute',
            tpm: 'tokens per minute',
            rpd: 'requests per day',
          };
          const limitMessage = `You have reached your limit. You are requesting more ${limitNames[limitCheck]} than the limit of the model. Please wait for a certain amount of time and retry.`;
          
          safeUpdateHistory((prev) => [
            ...prev,
            {
              role: 'user',
              content: sanitizedPrompt,
              timestamp: Date.now(),
              images,
            },
            {
              role: 'assistant',
              content: limitMessage,
              timestamp: Date.now(),
              status: 'error',
              model: nyxModel,
            }
          ]);
          return;
        }
      }

      // Cancel any existing request
      if (controllerRef.current) {
        controllerRef.current.abort();
      }

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        // Validate API key early
        if (!nyxApiKey && nyxProvider !== 'nyx-native' && navigator.onLine) {
          throw new Error(
            `${nyxProvider} API key not found. Please add your API key in Settings before using this model.`
          );
        }


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
        if (!options?.skipUserMessage) {
          const userMsg: ChatMessage = {
            role: 'user',
            content: sanitizedPrompt,
            timestamp: Date.now(),
            images,
          };

          safeUpdateHistory((prev) => [...prev, userMsg]);
        }

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
            model: nyxModel,
          },
        ]);

        // Optimize conversation history dynamically based on model tier
        const isLocalModel = nyxProvider === 'nyx-native' || nyxProvider === 'local' || nyxModel.endsWith('.gguf') || nyxModel.endsWith('-local');
        const maxTokens = isLocalModel ? 4096 : 32000;
        const minPreserved = isLocalModel ? 4 : 20;

        // For local models: sanitize assistant messages to strip raw XML tool calls
        // that may have leaked from previous responses before sending history
        const sanitizeForLocal = (msgs: typeof historySnapshotRef.current) => {
          if (!isLocalModel) return msgs;
          return msgs.map(m => {
            if (m.role !== 'assistant') return m;
            // Strip <tool_call>...</tool_call> and leftover XML artifacts
            const cleaned = m.content
              .replace(/<tool_call>.*?(<\/tool_call>)?/gs, '')
              .replace(/Task executed but no final synthesis was generated\.?/g, '')
              .trim();
            return { ...m, content: cleaned };
          }).filter(m => m.content.trim().length > 0 || m.role === 'user');
        };

        const optimizedHistory = await ContextManager.optimizeContextWindow(
          sanitizeForLocal(historySnapshotRef.current),
          maxTokens,
          minPreserved
        );

        // Compress prompt to mitigate context overflows if it's too large
        const compressedPrompt = AIService.compressPrompt(sanitizedPrompt, 50000);

        const fastIntents = ['greeting', 'farewell', 'gratitude', 'general_chat'];
        const isFastIntent = fastIntents.includes(analysis.intent);

        // Retrieve relevant memories and construct systemPromptAddon
        let memoryAddon = '';
        try {
          const isTauriEnv = typeof window !== 'undefined' &&
            ('_tauri' in window || '__TAURI__' in window || '__TAURI_INTERNALS__' in window);
          
          let fetchedMemories: any[] = [];
          if (isTauriEnv) {
            fetchedMemories = await invoke<any[]>('db_get_memories').catch(() => []);
          } else {
            const local = localStorage.getItem('nyx_mock_memories');
            if (local) fetchedMemories = JSON.parse(local);
          }

          if (fetchedMemories.length > 0) {
            const promptLower = sanitizedPrompt.toLowerCase();
            // Significant words only (strip stopwords below 4 chars)
            const promptWords = promptLower.split(/\s+/).filter(w => w.length > 3);

            // Intent → category mapping for bonus scoring
            const intentCategoryMap: Record<string, string[]> = {
              code_generation: ['coding', 'programming'],
              code_debug: ['coding', 'debugging'],
              code_review: ['coding'],
              refactor: ['coding'],
              architecture_design: ['coding', 'architecture'],
              web_search: ['general'],
              general_chat: ['general', 'preferences'],
            };
            const relevantCategories = intentCategoryMap[analysis.intent] ?? ['general'];

            // Score each memory by multi-signal relevance
            const scored = fetchedMemories.map(m => {
              const factLower = (m.fact ?? '').toLowerCase();
              const catLower = (m.category ?? '').toLowerCase();

              // Signal 1: word overlap with prompt (0–1 per matching word)
              const overlapScore = promptWords.reduce(
                (acc, w) => acc + (factLower.includes(w) ? 1 : 0), 0
              ) / Math.max(promptWords.length, 1);

              // Signal 2: category relevance bonus
              const catScore = relevantCategories.some(c => catLower.includes(c)) ? 0.4 : 0;

              // Signal 3: recency — prefer newer memories (created_at is unix timestamp)
              const ageSeconds = Date.now() / 1000 - (m.created_at ?? 0);
              const recencyScore = Math.max(0, 1 - ageSeconds / (7 * 24 * 3600)); // decay over 7 days

              return { memory: m, score: overlapScore + catScore + recencyScore * 0.2 };
            });

            // Sort by score descending, take top 5
            const selected = scored
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .filter(s => s.score > 0.1) // Drop entirely irrelevant memories
              .map(s => s.memory);

            // If nothing scored above threshold, fall back to 3 most recent
            const finalSelected = selected.length > 0 ? selected : fetchedMemories.slice(0, 3);

            if (finalSelected.length > 0) {
              memoryAddon = `\n\n[Long-Term Memory / User Preferences]\nHere are relevant facts and preferences remembered about the user:\n` +
                finalSelected.map((m: any) => `- ${m.fact} (${m.category})`).join('\n') +
                `\nUse this context to tailor your response accordingly.`;
            }
          }
        } catch (err) {
          console.warn('[Chat Pipeline] Failed to load long-term memories:', err);
        }


        // 4. Initialize agent with snapshot (not live ref)
        const systemPromptAddon = (options?.systemPromptAddon || '') + memoryAddon;

        // Determine correct base URL and model for local inference if requested
        let finalBaseUrl = 'https://api.openai.com/v1'; // Default OpenAI base
        let finalModel = nyxModel;
        let finalApiKey = nyxApiKey || 'dummy_key';

        const isActuallyLocal = nyxProvider === 'nyx-native' || nyxProvider === 'local' || finalModel.endsWith('.gguf') || finalModel.endsWith('-local');

        if (isActuallyLocal) {
          finalBaseUrl = 'http://127.0.0.1:8080/v1';
          finalApiKey = 'local';
        } else {
          // Set Base URL for Cloud Providers
          if (nyxProvider === 'anthropic') finalBaseUrl = 'https://api.anthropic.com/v1';
          else if (nyxProvider === 'gemini') finalBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
          else if (nyxProvider === 'groq') finalBaseUrl = 'https://api.groq.com/openai/v1';
        }

        const agent = new TokioOrchestratorService(
          finalApiKey,
          nyxProvider,
          finalModel,
          crypto.randomUUID()
        );

        // BUG 2 FIX: Actually start the search if enabled, rather than hardcoding to undefined
        let searchContextPromise: Promise<string> | undefined = undefined;
        if (webSearchEnabled) {
           if (analysis.intent === 'web_search' || sanitizedPrompt.toLowerCase().includes('search')) {
              searchContextPromise = (async () => {
                try {
                  const query = sanitizedPrompt;
                  const numResults = 5;
                  
                  const storeState = useNyxStore.getState();
                  const searchProvider = storeState.searchProvider || 'duckduckgo';
                  const apiKey = storeState.apiKeys[searchProvider] || '';
                  return await invoke<string>('search_web_command', {
                    query,
                    numResults,
                    provider: searchProvider,
                    apiKey,
                  });
                } catch (e) {
                  console.warn('Pre-search failed:', e);
                  return '';
                }
              })();
           }
        }

        // 6. Stream response with timeout protection and Execution Mode handling
        const storeExecutionMode = useNyxStore.getState().executionMode || 'auto';
        let executionMode = storeExecutionMode;
        if (executionMode === 'auto') {
          executionMode = analysis.suggestedExecutionMode || 'standard';
          if (analysis.suggestedExecutionReasoning) {
            toast.info(`[Auto-Mode] ${analysis.suggestedExecutionReasoning}`);
          }
        }

        const promptModels = extractModelsFromPrompt(sanitizedPrompt);
        if (executionMode !== 'standard' && promptModels.length < 2) {
          executionMode = 'standard';
        }

        let generator: AsyncGenerator<any>;

        if (executionMode === 'standard') {
          generator = agent.streamResponse(
            compressedPrompt,
            analysis,
            systemPromptAddon,
            controller.signal,
            searchContextPromise,
            images
          ) as AsyncGenerator<any>;
        } else {
          // Adapter generator for parallel, ensemble, ab-test
          generator = (async function* () {
            const queue: any[] = [];
            let resolveNext: (() => void) | null = null;
            let isDone = false;

            const onStream = (event: any) => {
              queue.push(event);
              if (resolveNext) {
                resolveNext();
                resolveNext = null;
              }
            };

            try {
              const baseOptions: any = { 
                apiKey: nyxApiKey, 
                settings: modelSettings,
                options: { onStream, streamEvents: true, signal: controller.signal }
              };
              
              let responseText = '';
              let metadata: any = { latency: 0, tokens: 0, tps: 0 };
              
              const promptModels = extractModelsFromPrompt(sanitizedPrompt);
              const configs = getCandidatesForExecution(promptModels, nyxModel, nyxProvider);

              let executionPromise;

              if (executionMode === 'parallel') {
                executionPromise = AIService.executeParallel(
                  configs,
                  compressedPrompt,
                  baseOptions
                ).then((results) => {
                  responseText = results
                    .map((r) => `### Model: ${AVAILABLE_MODELS.find(m => m.id === r.model)?.name || r.model}\n\n${r.text}`)
                    .join('\n\n---\n\n');
                  metadata = results[0]?.metrics || metadata;
                  queue.push({ type: 'text', content: responseText });
                  if (metadata) queue.push({ type: 'metrics', metadata });
                });
              } else if (executionMode === 'ensemble') {
                const synthesizer = { modelId: nyxModel, provider: nyxProvider };
                executionPromise = AIService.executeEnsemble(
                  configs,
                  synthesizer,
                  compressedPrompt,
                  baseOptions
                ).then((res) => {
                  responseText = res.text;
                  metadata = res.metrics || metadata;
                  queue.push({ type: 'text', content: responseText });
                  if (metadata) queue.push({ type: 'metrics', metadata });
                });
              } else if (executionMode === 'ab-test') {
                const variants = configs.map((c) => ({ weight: 0.5, config: c }));
                executionPromise = AIService.executeABTest(compressedPrompt, variants, baseOptions).then((res) => {
                  responseText = res.text;
                  metadata = res.metrics || metadata;
                  queue.push({ type: 'text', content: responseText });
                  if (metadata) queue.push({ type: 'metrics', metadata });
                });
              }

              if (executionPromise) {
                executionPromise.catch((err: any) => {
                  const errorMsg = err instanceof Error ? err.message : String(err);
                  queue.push({ type: 'error', content: errorMsg });
                }).finally(() => {
                  isDone = true;
                  if (resolveNext) resolveNext();
                });
              } else {
                isDone = true;
              }

              while (!isDone || queue.length > 0) {
                if (queue.length > 0) {
                  yield queue.shift();
                } else {
                  await new Promise<void>(r => resolveNext = r);
                }
              }

              yield { type: 'done' };
            } catch (err: any) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              yield { type: 'error', content: errorMsg };
            }
          })();
        }

        // Wrap processStream with timeout (10 minutes total, but cleared on first chunk)
        let streamTimeoutHandle: NodeJS.Timeout | null = null;
        const streamTimeoutPromise = new Promise<any>((_, reject) => {
          streamTimeoutHandle = setTimeout(() => {
            controller.abort();
            reject(
              new Error('Stream response timeout after 10 minutes - no data received from model')
            );
          }, 600000); // 10 minutes total safety timeout
        });

        try {
          const streamPromise = processStream(
            generator,
            controller.signal,
            60000,
            () => {
              if (streamTimeoutHandle) {
                clearTimeout(streamTimeoutHandle);
                streamTimeoutHandle = null;
              }
            }
          );
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

          // fallow-ignore-next-line code-duplication
          const enrichedMetrics = {
            ...finalMetrics,
            finishReason,
          };

          safeUpdateHistory((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              const wasAborted = controller.signal.aborted;
              const finalContent = wasAborted && text
                ? `${text}\n\n[Response interrupted by user]`
                : text;
              next[next.length - 1] = {
                ...last,
                content: finalContent,
                status: wasAborted ? 'stopped' : (finishReason === 'error' ? 'error' : 'success'),
                metrics: {
                  ...enrichedMetrics,
                  finishReason: wasAborted ? 'stopped' : finishReason,
                },
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
          useUsageStore.getState().recordUsage(nyxModel, nyxApiKey, finalMetrics.tokens);

          // 8. Log rollout
          if (logRollout && text) {
            let antigravityId: string | undefined;
            // Get the last assistant message
            const lastMsg = historySnapshotRef.current[historySnapshotRef.current.length - 1];
            if (lastMsg?.role === 'assistant' && lastMsg.metadata?.antigravity_id) {
              antigravityId = lastMsg.metadata.antigravity_id;
            }
            
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
                : [],
              null,
              antigravityId
            );
          }

          // 9. Update suggestions
          getSuggestions(historySnapshotRef.current);

          // 10. Memory commit — fire-and-forget, silent, never blocks UI
          if (text.trim()) {
            triggerMemoryCommit({
              prompt: sanitizedPrompt,
              response: text,
              provider: nyxProvider,
              modelId: nyxModel,
              agentType: 'chat',
            }).catch((err) => console.warn('[Chat Pipeline] Memory commit failed:', err));
          }


          setState((s) => ({ ...s, finishReason: finishReason as any }));
        } catch (timeoutErr: any) {
          // Stream timeout or Promise.race error
          if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle);
          throw timeoutErr;
        }
      } catch (error: any) {
        const isAborted = error?.name === 'AbortError' || controller.signal.aborted;
        
        let rateLimitReason: 'rpm' | 'tpm' | 'rpd' | null = null;
        if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
           rateLimitReason = 'rpm'; // Default to rpm since it's the most common 429
           if (error?.message?.toLowerCase().includes('token')) rateLimitReason = 'tpm';
           if (error?.message?.toLowerCase().includes('day') || error?.message?.toLowerCase().includes('daily')) rateLimitReason = 'rpd';
           
           const modelConfig = AVAILABLE_MODELS.find(m => m.id === nyxModel);
           if (modelConfig && modelConfig.limits) {
             useUsageStore.getState().setLimitHit(nyxModel, nyxApiKey, rateLimitReason, modelConfig.limits);
           }
        }

        if (!isAborted) console.error('[Chat Pipeline] Error:', error);

        // Show error toast to user immediately if not a rate limit (rate limits are handled via chat message)
        if (!isAborted && !rateLimitReason) {
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
            const errorMsg = error?.message || 'Generation failed.';
            
            let finalContent = partialContent
              ? (isAborted ? `${partialContent}\n\n[Response interrupted by user]` : partialContent)
              : (isAborted ? 'Generation stopped.' : `Error: ${errorMsg}`);
            
            if (rateLimitReason) {
              const limitNames = {
                rpm: 'requests per minute',
                tpm: 'tokens per minute',
                rpd: 'requests per day',
              };
              finalContent = `You have reached your limit. You are requesting more ${limitNames[rateLimitReason]} than the limit of the model. Please wait for a certain amount of time and retry.`;
            }

            next[next.length - 1] = {
              ...last,
              status: isAborted ? 'stopped' : 'error',
              content: finalContent,
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

    // Kill any active generation slot on the local llama-server.
    // Without this, llama-server continues generating until context is exhausted
    // even after the client disconnects, causing "slot exhaustion" that blocks
    // all subsequent local model requests.
    const activeModel = models['nyx'];
    const currentProvider = activeModel ? detectProvider(activeModel) : null;
    if (currentProvider === 'nyx-native') {
      fetch('http://127.0.0.1:8080/slots/0', { method: 'DELETE' }).catch(() => {
        // Silently ignore — server may not be running
      });
    }

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
