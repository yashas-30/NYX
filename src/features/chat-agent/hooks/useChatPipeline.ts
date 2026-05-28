/**
 * @file src/features/chat-agent/hooks/useChatPipeline.ts
 * @description Dedicated AI streaming execution pipeline for the NYX Chat Agent.
 */

import { useState, useCallback, useRef } from 'react';
import { ChatMessage, TelemetryMetrics, AISettings } from '@src/infrastructure/types';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { analyzePrompt } from '@src/core/services/promptClassifier';
import { ChatAgent } from '../ChatAgent';
import { triggerMemoryCommit } from '@src/features/coder/api/coderApi';
import { countTokens } from '@src/core/services/ai.service';

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
}

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
  webSearchEnabled = true,
}: ChatPipelineProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const runChat = useCallback(
    async (prompt: string, images?: { name: string; mimeType: string; data: string }[]) => {
      const nyxModel = models['nyx'];
      if ((!prompt.trim() && (!images || images.length === 0)) || !nyxModel) return;
      const nyxProvider = detectProvider(nyxModel);
      const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys) || '';

      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      // Append user message
      const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now(), images };
      updateHistory((prev) => [...prev, userMsg]);

      setIsLoading(true);
      setSuggestedPrompts([]);
      updateMetrics({ latency: 0, tokens: 0, tps: 0 });

      try {
        const analysis = analyzePrompt(prompt);

        updateHistory((prev) => [
          ...prev,
          { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' },
        ]);

        const agent = new ChatAgent({
          modelId: nyxModel,
          provider: nyxProvider,
          apiKey: nyxApiKey,
          settings: modelSettings,
          history: historyRef.current,
          lightningDirectives: lightningEnabled ? lightningDirectives : undefined,
          webSearchEnabled: webSearchEnabled,
        });

        let searchContext = '';
        if (agent.shouldSearchWeb(prompt, analysis)) {
          console.log('[Chat Pipeline] Web search intent detected. Gathering context...');
          setIsSearching(true);
          try {
            searchContext = await agent.gatherContext(prompt, controller.signal);
          } finally {
            setIsSearching(false);
          }
        }

        let finalMetrics: any = null;
        let lastStreamText = '';

        for await (const chunk of agent.streamResponse(
          prompt,
          analysis,
          controller.signal,
          searchContext,
          images
        )) {
          if (chunk.type === 'thinking') {
            continue;
          }
          if (chunk.type === 'text') {
            lastStreamText = chunk.content;
            if (chunk.metadata) finalMetrics = chunk.metadata;

            // Stream update
            updateHistory((prev) => {
              const h = [...prev];
              const last = h[h.length - 1];
              if (last?.role === 'assistant') {
                last.content = chunk.content;
                if (chunk.metadata) last.metrics = chunk.metadata;
              }
              return h;
            });
            if (chunk.metadata) updateMetrics(chunk.metadata);
          }
        }

        trackUsage(nyxProvider, finalMetrics?.tokens || countTokens(lastStreamText));

        // Asynchronously trigger memory keeper commit to distill conversational turn
        triggerMemoryCommit({
          prompt,
          response: lastStreamText,
          provider: nyxProvider,
          modelId: nyxModel,
          agentType: 'chat',
        }).catch((err) => {
          console.warn('[Chat Pipeline] Memory keeper commit failed:', err);
        });

        updateHistory((prev) => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last?.role === 'assistant') {
            last.status = 'success';
            if (finalMetrics) last.metrics = finalMetrics;

            // Log rollout trace in Agent Lightning
            if (logRollout) {
              logRollout(
                'chat',
                prompt,
                lastStreamText,
                finalMetrics
                  ? [
                      {
                        name: 'chat_agent_inference',
                        type: 'llm_call',
                        input: prompt,
                        output: lastStreamText,
                        durationMs: finalMetrics.latency || 1000,
                        tokensUsed: finalMetrics.tokens || 0,
                      },
                    ]
                  : []
              );
            }
          }
          getSuggestions(h);
          return h;
        });
      } catch (error: any) {
        const isAborted = error?.name === 'AbortError' || controller.signal.aborted;

        updateHistory((prev) => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant') {
            last.status = isAborted ? 'stopped' : 'error';
            last.content =
              error.message ||
              'Error: Generation failed. Please check your model settings or connection.';
          }
          return h;
        });
      } finally {
        controllerRef.current = null;
        setIsSearching(false);
        setIsLoading(false);
      }
    },
    [
      models,
      apiKeys,
      modelSettings,
      trackUsage,
      updateHistory,
      updateMetrics,
      setSuggestedPrompts,
      getSuggestions,
      webSearchEnabled,
      lightningEnabled,
      lightningDirectives,
      logRollout,
    ]
  );

  const stopChat = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsSearching(false);
    setIsLoading(false);
  }, []);

  return { isLoading, isSearching, runChat, stopChat };
};
