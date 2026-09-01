/**
 * useAgentRunner.ts
 *
 * Frontend Hook connecting to the Tauri Native Rust Autonomous Agent Pipeline.
 * Handles IPC channel streaming for Conductor Plan DAG events, ReAct tool steps,
 * live quota telemetry, and cancellation.
 */

import { useState, useCallback, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { runLangGraphAgent } from '@src/core/agents/langgraphAgent';
import {
  antigravityAgent,
  ANTIGRAVITY_BASE_MODEL,
  ANTIGRAVITY_BACKUP_MODEL,
} from '@src/core/agents/antigravityAgent';

export interface PlanStep {
  step_id: number;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result_summary?: string | null;
}

export interface ConductorPlan {
  goal: string;
  steps: PlanStep[];
}

export interface ConductorProgressEvent {
  event_type:
    | 'plan_started'
    | 'plan_created'
    | 'step_started'
    | 'step_finished'
    | 'step_failed'
    | 'finished'
    | 'error';
  current_step?: number | null;
  message: string;
  plan?: ConductorPlan | null;
  final_output?: string | null;
}

export interface AgentExecutionStep {
  iteration: number;
  thought: string;
  tool_name?: string | null;
  tool_args?: any;
  tool_result?: string | null;
  is_error: boolean;
  is_finished: boolean;
}

export interface ProviderQuotaState {
  provider: string;
  api_key_hash: string;
  remaining_requests?: number | null;
  remaining_tokens?: number | null;
  limit_requests?: number | null;
  limit_tokens?: number | null;
  is_healthy: boolean;
  latency_ema_ms: number;
}

export function useAgentRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [plan, setPlan] = useState<ConductorPlan | null>(null);
  const [currentStepId, setCurrentStepId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [executionSteps, setExecutionSteps] = useState<AgentExecutionStep[]>([]);
  const [finalOutput, setFinalOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quotaStates, setQuotaStates] = useState<ProviderQuotaState[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchQuotaStates = useCallback(async () => {
    try {
      const states = await invoke<ProviderQuotaState[]>('nyx_get_live_quota_states');
      setQuotaStates(states);
    } catch (e) {
      console.warn('[useAgentRunner] Failed to fetch quota states:', e);
    }
  }, []);

  const runAgent = useCallback(
    async (
      prompt: string,
      workspaceRoot?: string,
      engine: 'native' | 'langgraph' | 'antigravity' = 'native'
    ) => {
      setIsRunning(true);
      setError(null);
      setFinalOutput(null);
      setExecutionSteps([]);
      setPlan(null);
      setCurrentStepId(null);
      setStatusMessage(`Initializing autonomous agent (${engine})...`);

      const apiKeys = useNyxStore.getState().apiKeys;
      const geminiKey = getEffectiveApiKey('gemini', apiKeys) || '';

      // ── 1. Antigravity Managed Agent Engine ───────────────────────────────
      if (engine === 'antigravity' && geminiKey) {
        try {
          setStatusMessage('Running Antigravity Managed Agent (Gemini 3.5 Flash-Lite)...');
          const result = await antigravityAgent.runInteraction({
            apiKey: geminiKey,
            prompt,
            model: ANTIGRAVITY_BASE_MODEL,
            backupModel: ANTIGRAVITY_BACKUP_MODEL,
            environment: 'remote',
            onStep: (step) => {
              setExecutionSteps((prev) => [
                ...prev,
                {
                  iteration: prev.length + 1,
                  thought: step.thought || '',
                  tool_name: step.tool_name,
                  tool_args: step.tool_args,
                  tool_result: step.tool_result,
                  is_error: false,
                  is_finished: false,
                },
              ]);
            },
          });

          setFinalOutput(result.outputText);
          setStatusMessage('Antigravity task completed.');
          return result.outputText;
        } catch (err: any) {
          const errStr =
            typeof err === 'string' ? err : err?.message || 'Antigravity execution failed';
          setError(errStr);
          setStatusMessage(`Error: ${errStr}`);
          throw err;
        } finally {
          setIsRunning(false);
        }
      }

      // ── 2. LangGraph ReAct Agent Engine ──────────────────────────────────
      if (engine === 'langgraph' && geminiKey) {
        try {
          setStatusMessage('Executing LangGraph ReAct state workflow...');
          const result = await runLangGraphAgent(prompt, {
            apiKey: geminiKey,
            primaryModel: ANTIGRAVITY_BASE_MODEL,
            backupModel: ANTIGRAVITY_BACKUP_MODEL,
            onStep: (step) => {
              setExecutionSteps((prev) => {
                const existingIdx = prev.findIndex((s) => s.iteration === step.iteration);
                const mapped: AgentExecutionStep = {
                  iteration: step.iteration,
                  thought: step.thought || '',
                  tool_name: step.toolName || null,
                  tool_args: step.toolArgs,
                  tool_result: step.toolResult || null,
                  is_error: step.isError,
                  is_finished: step.isFinished,
                };
                if (existingIdx !== -1) {
                  const updated = [...prev];
                  updated[existingIdx] = mapped;
                  return updated;
                }
                return [...prev, mapped];
              });
            },
          });

          setFinalOutput(result);
          setStatusMessage('LangGraph task completed.');
          return result;
        } catch (err: any) {
          const errStr =
            typeof err === 'string' ? err : err?.message || 'LangGraph execution failed';
          setError(errStr);
          setStatusMessage(`Error: ${errStr}`);
          throw err;
        } finally {
          setIsRunning(false);
        }
      }

      // ── 3. Native Tauri Rust Pipeline Engine ──────────────────────────────
      const progressChannel = new Channel<ConductorProgressEvent>();
      const stepChannel = new Channel<AgentExecutionStep>();

      progressChannel.onmessage = (event: ConductorProgressEvent) => {
        setStatusMessage(event.message);
        if (event.plan) {
          setPlan(event.plan);
        }
        if (event.current_step !== undefined) {
          setCurrentStepId(event.current_step);
        }
        if (event.final_output) {
          setFinalOutput(event.final_output);
        }
      };

      stepChannel.onmessage = (step: AgentExecutionStep) => {
        setExecutionSteps((prev) => {
          const existingIdx = prev.findIndex(
            (s) => s.iteration === step.iteration && s.tool_name === step.tool_name
          );
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = step;
            return updated;
          }
          return [...prev, step];
        });
      };

      try {
        const result = await invoke<string>('nyx_run_agent_pipeline', {
          prompt,
          workspaceRoot: workspaceRoot || null,
          onProgress: progressChannel,
          onStep: stepChannel,
        });

        setFinalOutput(result);
        await fetchQuotaStates();
        return result;
      } catch (err: any) {
        const errStr = typeof err === 'string' ? err : err?.message || 'Agent execution failed';
        setError(errStr);
        setStatusMessage(`Error: ${errStr}`);
        throw err;
      } finally {
        setIsRunning(false);
      }
    },
    [fetchQuotaStates]
  );

  const cancelAgent = useCallback(async () => {
    try {
      await invoke('nyx_cancel_agent');
      setStatusMessage('Cancellation requested...');
    } catch (e) {
      console.warn('Failed to cancel agent:', e);
    }
  }, []);

  return {
    isRunning,
    plan,
    currentStepId,
    statusMessage,
    executionSteps,
    finalOutput,
    error,
    quotaStates,
    runAgent,
    cancelAgent,
    fetchQuotaStates,
  };
}
