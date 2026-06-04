// @ts-nocheck
/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for NYX Coder agent.
 * Dispatches requests to CoderAgent and handles streaming code generation.
 */

import { useState, useCallback, useRef } from 'react';
import {
  ChatMessage,
  TelemetryMetrics,
  AISettings,
  AgentPersona,
  SubagentTask,
} from '@src/infrastructure/types';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { toast } from '@src/shared/components/ui/sonner';
import { formatProviderError } from '@src/infrastructure/api/streamParser';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { writeFile } from '@src/infrastructure/api/coderApi';

import { useBackgroundTasks } from './pipeline/useBackgroundTasks';
import { usePromptAnalysis } from './pipeline/usePromptAnalysis';
import { useStreamProcessor } from './pipeline/useStreamProcessor';
import { useMetricsTracker } from './pipeline/useMetricsTracker';

interface PipelineProps {
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  agentPersonas: Record<'nyx', AgentPersona>;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  history: ChatMessage[];
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  webSearchEnabled: boolean;
  // codebaseKnowledgeEnabled: boolean;
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
  logRollout?: (
    agentType: 'chat' | 'coder',
    task: string,
    response: string,
    spans?: any[],
    initialReward?: number | null
  ) => string;
}

export const useAgentPipeline = ({
  models,
  apiKeys,
  modelSettings,
  trackUsage,
  history,
  updateHistory,
  updateMetrics,
  getSuggestions,
  setSuggestedPrompts,
  webSearchEnabled,
  codebaseKnowledgeEnabled,
  lightningEnabled,
  lightningDirectives,
  logRollout,
}: PipelineProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [subagentTasks, setSubagentTasks] = useState<SubagentTask[]>([]);
  const [pendingToolConfirm, setPendingToolConfirm] = useState<{
    toolName: string;
    args: any;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const clearController = useCallback(() => {
    controllerRef.current = null;
  }, []);

  const { triggerBackgroundCritic, commitToMemory } = useBackgroundTasks({ models, apiKeys });

  const { agentMode, setAgentMode, agentReasoning, setAgentReasoning, analyzeAndRoute } =
    usePromptAnalysis({
      updateHistory,
      setIsLoading,
      clearController,
    });

  const { processChunkMetrics, getFinalMetrics, clearMetrics } = useMetricsTracker({
    updateHistory,
    updateMetrics,
  });

  // fallow-ignore-next-line code-duplication
  const handleFileWrite = useCallback(async (filePath: string, content: any) => {
    try {
      if (typeof content === 'string') {
        await writeFile(filePath, content);
        console.log(`[File Writer] Successfully wrote file: ${filePath}`);
      }
    } catch (writeErr: any) {
      console.error('Failed to write file:', writeErr);
    }
  }, []);

  const { processStream } = useStreamProcessor({
    updateHistory,
    handleFileWrite,
    processChunkMetrics,
  });

  /**
   * Main execution handler that routes the prompt dynamically.
   */
  const runCoder = useCallback(
    async (prompt: string) => {
      const nyxModel = models['nyx'];
      if (!prompt.trim() || !nyxModel) return;
      const nyxProvider = detectProvider(nyxModel);
      const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys) || '';

      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      // Append user message
      const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
      updateHistory((prev) => [...prev, userMsg]);

      setIsLoading(true);
      setSuggestedPrompts([]);
      updateMetrics({ latency: 0, tokens: 0, tps: 0 });
      clearMetrics();
      setSubagentTasks([]);
      setAgentMode(null);
      setAgentReasoning('');

      try {
        const analysisResult = analyzeAndRoute(prompt);
        if (!analysisResult) {
          // Early exit triggered by missing debug details
          return;
        }
        const { analysis, route } = analysisResult;

        const streamResponseFromServer = async function* (signal: AbortSignal) {
          const response = await fetchWithAuth('/api/v1/agents/coder', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: nyxModel,
              prompt,
              history: historyRef.current,
              apiKey: nyxApiKey,
              gatewayUrls: (modelSettings as any)?.gatewayUrls,
            }),
            signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(errText || `Server returned ${response.status}`);
          }

          if (!response.body) {
            throw new Error('No response body from server');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulatedText = '';
          const startTime = Date.now();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6).trim();

                if (data === '[DONE]') {
                  return;
                }

                try {
                  const event = JSON.parse(data);

                  if (event.error) {
                    throw new Error(event.error);
                  }

                  switch (event.type) {
                    case 'run-started':
                    case 'turn-started':
                      yield {
                        type: 'thinking',
                        content: 'NYX Coder Agent is reasoning...\n',
                      };
                      break;

                    case 'assistant-text-delta':
                      if (event.text) {
                        accumulatedText += event.text;
                        yield {
                          type: 'text',
                          content: accumulatedText,
                        };
                      }
                      break;

                    case 'tool-started':
                      if (event.toolCall) {
                        yield {
                          type: 'tool_call',
                          metadata: {
                            id: event.toolCall.toolCallId,
                            function: {
                              name: event.toolCall.toolName,
                              arguments: JSON.stringify(event.toolCall.input),
                            },
                          },
                        };
                      }
                      break;

                    case 'tool-finished':
                      if (event.toolCall && event.message?.content?.[0]) {
                        const tcOutput = event.message.content[0].output || '';
                        yield {
                          type: 'tool_result',
                          metadata: {
                            id: event.toolCall.toolCallId,
                            status: 'success',
                            result:
                              typeof tcOutput === 'object' ? JSON.stringify(tcOutput) : tcOutput,
                          },
                        };
                      }
                      break;

                    case 'usage-updated':
                      if (event.snapshot?.usage) {
                        const usage = event.snapshot.usage;
                        yield {
                          type: 'text',
                          content: accumulatedText,
                          metadata: {
                            totalTokens: usage.inputTokens + usage.outputTokens,
                            latencyMs: Date.now() - startTime,
                          },
                        };
                      }
                      break;
                  }
                } catch (parseErr) {
                  // Ignore JSON parse errors for chunk boundaries
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        };

        updateHistory((prev) => [
          ...prev,
          { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' },
        ]);

        const lastStreamText = await processStream(streamResponseFromServer(controller.signal));

        const finalMetrics = getFinalMetrics();

        updateHistory((prev) => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last?.role === 'assistant') {
            last.status = 'success';
            if (finalMetrics) last.metrics = finalMetrics;

            // Log rollout trace in Agent Lightning
            if (logRollout) {
              logRollout(
                'coder',
                prompt,
                lastStreamText,
                finalMetrics
                  ? [
                      {
                        name: 'coder_agent_inference',
                        type: 'llm_call',
                        input: prompt,
                        output: lastStreamText,
                        durationMs: finalMetrics.latency || 1000,
                        tokensUsed: finalMetrics.tokens || 0,
                      },
                    ]
                  : [],
                null
              );
            }
          }
          getSuggestions(h);
          return h;
        });

        if (lastStreamText) {
          triggerBackgroundCritic(prompt, lastStreamText, analysis?.complexity);
          commitToMemory(prompt, lastStreamText);
        }
      } catch (error: any) {
        const isAborted = error?.name === 'AbortError' || controller.signal.aborted;

        if (error.message && error.message.startsWith('SAFETY_GATE_BLOCKED:')) {
          try {
            const payload = JSON.parse(error.message.substring(20));
            updateHistory((prev) => {
              const h = prev.filter((m) => !(m.role === 'assistant' && m.content === ''));
              return [
                ...h,
                {
                  role: 'assistant',
                  content: `⚠️ **NYX Safety Gate Blocked**\n\n${payload.message}\n\n${payload.details && payload.details.length > 0 ? `**Details:**\n${payload.details.map((d: any) => `- ${d}`).join('\n')}` : ''}`,
                  timestamp: Date.now(),
                  status: 'success',
                },
              ];
            });
            toast.warning('Request blocked by Safety Gate');
            setIsLoading(false);
            controllerRef.current = null;
            return;
          } catch {
            // Ignore safety gate check errors
          }
        }

        updateHistory((prev) => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant') {
            last.status = isAborted ? 'stopped' : 'error';
            last.content = formatProviderError(
              error.message ||
                'Error: Generation failed. Please check your model settings or connection.'
            );
          } else if (last && last.role === 'user') {
            // Agent failed before inserting the assistant placeholder
            h.push({
              role: 'assistant',
              content: formatProviderError(error.message || 'Error: Generation failed.'),
              timestamp: Date.now(),
              status: 'error',
            });
          }
          return h;
        });
      } finally {
        controllerRef.current = null;
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
      webSearchEnabled,
      codebaseKnowledgeEnabled,
      getSuggestions,
      triggerBackgroundCritic,
      commitToMemory,
      lightningEnabled,
      lightningDirectives,
      logRollout,
      analyzeAndRoute,
      processStream,
      getFinalMetrics,
      clearMetrics,
      setAgentMode,
      setAgentReasoning,
    ]
  );

  const stopCoder = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return {
    runCoder,
    stopCoder,
    isLoading,
    subagentTasks,
    agentMode,
    agentReasoning,
    pendingToolConfirm,
  };
};
