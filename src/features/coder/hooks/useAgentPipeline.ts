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
import { CoderAgentWithTools } from '@src/core/agents/coderAgentWithTools';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { SubagentOrchestrator } from '../services/SubagentOrchestrator';
import { triggerCritic, triggerMemoryCommit, writeFile } from '@src/infrastructure/api/coderApi';
import { analyzePrompt, routeToAgent } from '@src/core/services/promptClassifier';
import { isMissingDebugDetails, MISSING_DEBUG_DETAILS_RESPONSE } from '@src/shared/promptAnalyzer';

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
  codebaseKnowledgeEnabled: boolean;
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
  const [agentMode, setAgentMode] = useState<'chat' | 'coder' | 'architect' | null>(null);
  const [agentReasoning, setAgentReasoning] = useState<string>('');
  const [pendingToolConfirm, setPendingToolConfirm] = useState<{
    toolName: string;
    args: any;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const triggerBackgroundCritic = useCallback(
    async (prompt: string, responseText: string, complexity?: string) => {
      // UGLY-3 fix: Skip critic for trivial/simple prompts — saves tokens and reduces noise
      const trivialComplexities = ['trivial', 'simple'];
      if (complexity && trivialComplexities.includes(complexity)) {
        console.debug(
          '[BackgroundCritic] Skipping critic for low-complexity prompt (complexity:',
          complexity,
          ')'
        );
        return;
      }
      // Also skip very short responses (< 200 chars) — likely single-line completions
      if (responseText.trim().length < 200) {
        console.debug(
          '[BackgroundCritic] Skipping critic — response too short for meaningful evaluation'
        );
        return;
      }

      const nyxModel = models['nyx'];
      if (!nyxModel) return;
      const activeProvider = detectProvider(nyxModel);
      const apiKey = getEffectiveApiKey(activeProvider, apiKeys) || '';

      try {
        await triggerCritic({
          prompt,
          response: responseText,
          apiKey,
          provider: activeProvider,
          modelId: nyxModel,
        });
      } catch (err: any) {
        console.error('[useAgentPipeline] Background critic failed:', err);
      }
    },
    [models, apiKeys]
  );

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
      setSubagentTasks([]);
      setAgentMode(null);
      setAgentReasoning('');

      try {
        // Step 1: Analyze prompt
        const analysis = analyzePrompt(prompt);
        const route = routeToAgent(analysis);

        // Step 2: Show routing decision to user
        setAgentMode(route.agent);
        setAgentReasoning(route.reasoning);

        // Step 3: Execute Coder Agent pipeline
        if (analysis.intent === 'code_debug' && isMissingDebugDetails(prompt, 'debug')) {
          updateHistory((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: MISSING_DEBUG_DETAILS_RESPONSE,
              timestamp: Date.now(),
              status: 'success',
            },
          ]);
          toast.error('Please provide your code or error logs');
          setIsLoading(false);
          controllerRef.current = null;
          return;
        }

        let agent: any;
        
        // Force CoderAgent for all tasks in the Coder Pipeline to prevent breaking if backend chat fails.
        // The CoderAgent is capable of handling general chat and explanations internally.
        agent = new CoderAgentWithTools({
          modelId: nyxModel,
          provider: nyxProvider,
          apiKey: nyxApiKey,
          settings: modelSettings,
          history: historyRef.current,
          apiKeys,
          webSearchEnabled,
          codebaseKnowledgeEnabled,
          trackUsage,
          updateHistory,
          updateMetrics,
          getSuggestions,
          setSuggestedPrompts,
          originalPrompt: prompt,
          triggerBackgroundCritic,
          onSubagentTaskUpdate: (tasks) => {
            setSubagentTasks(tasks);
          },
          lightningDirectives: lightningEnabled ? lightningDirectives : undefined,
          createOrchestrator: () => new SubagentOrchestrator(),
          confirmTool: (toolName, args) => {
            return new Promise<boolean>((resolve) => {
              setPendingToolConfirm({
                toolName,
                args,
                resolve: (approved) => {
                  setPendingToolConfirm(null);
                  resolve(approved);
                },
              });
            });
          },
        });

        let finalMetrics: any = null;
        let lastStreamText = '';

        updateHistory((prev) => [
          ...prev,
          { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' },
        ]);

        for await (const chunk of agent.streamResponse(
          prompt,
          analysis,
          route,
          controller.signal
        )) {
          switch (chunk.type) {
            case 'thinking':
              updateHistory((prev) => {
                const h = [...prev];
                const last = h[h.length - 1];
                if (last?.role === 'assistant') {
                  last.content = `_${chunk.content}_`;
                }
                return h;
              });
              break;
            case 'file_write':
              try {
                if (
                  chunk.content &&
                  chunk.metadata &&
                  typeof chunk.metadata === 'object' &&
                  'content' in chunk.metadata
                ) {
                  const fileContent = (chunk.metadata as Record<string, any>).content;
                  if (typeof fileContent === 'string') {
                    await writeFile(chunk.content, fileContent);
                    console.log(`[File Writer] Successfully wrote file: ${chunk.content}`);
                  }
                }
              } catch (writeErr: any) {
                console.error('Failed to write file:', writeErr);
              }
              break;
            case 'text':
              lastStreamText = chunk.content || '';

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

                updateHistory((prev) => {
                  const h = [...prev];
                  const last = h[h.length - 1];
                  if (last?.role === 'assistant') {
                    last.content = chunk.content || '';
                    last.metrics = mappedMetrics;
                  }
                  return h;
                });

                updateMetrics(mappedMetrics);
              } else {
                updateHistory((prev) => {
                  const h = [...prev];
                  const last = h[h.length - 1];
                  if (last?.role === 'assistant') {
                    last.content = chunk.content || '';
                  }
                  return h;
                });
              }
              break;
            case 'tool_call':
              updateHistory((prev) => {
                const h = [...prev];
                const last = h[h.length - 1];
                if (last?.role === 'assistant') {
                  const currentToolCalls = last.toolCalls || [];
                  last.toolCalls = [
                    ...currentToolCalls,
                    {
                      id: chunk.metadata.id,
                      name: chunk.metadata.function.name,
                      arguments: chunk.metadata.function.arguments,
                    } as any,
                  ];
                }
                return h;
              });
              break;
            case 'tool_result':
              updateHistory((prev) => {
                const h = [...prev];
                const last = h[h.length - 1];
                if (last?.role === 'assistant' && last.toolCalls) {
                  const callIndex = last.toolCalls.findIndex((tc) => tc.id === chunk.metadata.id);
                  if (callIndex !== -1) {
                    // Just triggering an update to react. We could store the result if needed
                    last.toolCalls[callIndex] = { ...last.toolCalls[callIndex] };
                  }
                }
                return h;
              });
              break;
          }
        }

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

          // Asynchronously trigger memory keeper commit to distill conversational turn
          triggerMemoryCommit({
            prompt,
            response: lastStreamText,
            provider: nyxProvider,
            modelId: nyxModel,
            agentType: 'code',
          }).catch((err: any) => {
            console.warn('[Coder Pipeline] Memory keeper commit failed:', err);
          });
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
      lightningEnabled,
      lightningDirectives,
      logRollout,
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
