import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { ChatMessage, TelemetryMetrics, AISettings, StreamEvent } from '@src/infrastructure/types';
import { getEffectiveApiKey, detectProvider } from '@src/infrastructure/utils/provider';

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
  logRollout?: any;
  webSearchEnabled?: boolean;
  onStream?: (event: StreamEvent) => void;
  maxRetries?: number;
}

export const useChatPipeline = ({
  models,
  apiKeys,
  history,
  updateHistory,
  updateMetrics,
  onStream,
}: ChatPipelineProps) => {
  const [state, setState] = useState({
    isLoading: false,
    isSearching: false,
    isThinking: false,
    finishReason: null as string | null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const safeUpdateHistory = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    updateHistory((prev) => {
      const next = [...prev];
      if (next.length > 0) {
        // Deep clone only the last message as it's the one actively mutating
        const lastIdx = next.length - 1;
        next[lastIdx] = {
          ...next[lastIdx],
          toolCalls: next[lastIdx].toolCalls ? [...next[lastIdx].toolCalls] : undefined,
        };
      }
      return updater(next);
    });
  }, [updateHistory]);

  const runChat = useCallback(async (
    prompt: string,
    fileAttachments?: any[],
    options?: { skipUserMessage?: boolean, modelOverride?: string }
  ) => {
    const currentHistory = history;
    const modelToUse = options?.modelOverride || models['nyx'];
    const provider = detectProvider(modelToUse);
    const apiKey = getEffectiveApiKey(provider, apiKeys) || '';

    setState((s) => ({ ...s, isLoading: true, finishReason: null }));

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Append Assistant Placeholder
    safeUpdateHistory((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'assistant', content: '', timestamp: Date.now() }
    ]);

    let accumulatedText = '';
    const toolCallsMap = new Map<string, any>();

    try {
      const channel = new Channel<any>();
      channel.onmessage = (chunk) => {
        if (abortController.signal.aborted) return;

        if (chunk.event_type === 'text' || chunk.event_type === 'thinking') {
          accumulatedText += chunk.content || '';
          safeUpdateHistory((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.content = accumulatedText;
            }
            return next;
          });
          onStream?.({ type: 'text', content: accumulatedText } as StreamEvent);
        } else if (chunk.event_type === 'tool_start') {
          setState((s) => ({ ...s, isSearching: true }));
          const toolCall = chunk.tool_call;
          if (toolCall?.id) {
            toolCallsMap.set(toolCall.id, {
              id: toolCall.id,
              type: 'function',
              function: { name: chunk.name || '', arguments: '' },
              status: 'running',
            });
            
            safeUpdateHistory((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                last.toolCalls = Array.from(toolCallsMap.values());
              }
              return next;
            });
          }
        } else if (chunk.event_type === 'tool_result') {
          setState((s) => ({ ...s, isSearching: false }));
          const toolCall = chunk.tool_call;
          if (toolCall?.id) {
            const existing = toolCallsMap.get(toolCall.id);
            if (existing) {
              existing.status = 'success';
              existing.result = chunk.content;
              toolCallsMap.set(toolCall.id, existing);

              safeUpdateHistory((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  last.toolCalls = Array.from(toolCallsMap.values());
                }
                return next;
              });
            }
          }
        } else if (chunk.event_type === 'done') {
          setState((s) => ({ ...s, isLoading: false, finishReason: 'stop' }));
        } else if (chunk.event_type === 'error') {
          setState((s) => ({ ...s, isLoading: false, finishReason: 'error' }));
          console.error('[Chat Pipeline] Error from Rust:', chunk.error);
        }
      };

      // Transform history to UnifiedMessages
      const messages = currentHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      if (!options?.skipUserMessage) {
        messages.push({ role: 'user', content: prompt });
      }

      await invoke('run_orchestrator_turn', {
        request: {
          provider,
          model_id: modelToUse,
          api_key: apiKey,
          messages,
          system_instruction: "You are NYX, a highly capable assistant. You have access to tools like web_search (for real-time info/weather/news), conversational_memory (for saving/loading user preferences), and create_file. Use these tools proactively when the user's request requires them.",
        },
        onEvent: channel
      });

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[Chat Pipeline] Invocation error:', err);
        setState((s) => ({ ...s, isLoading: false, finishReason: 'error' }));
      }
    }
  }, [history, models, apiKeys, safeUpdateHistory, onStream]);

  const stopChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState((s) => ({ ...s, isLoading: false, isSearching: false, isThinking: false, finishReason: 'stopped' }));
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
