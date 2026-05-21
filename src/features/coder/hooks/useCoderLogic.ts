/**
 * @file src/features/coder/hooks/useCoderLogic.ts
 * @description Composed hook that orchestrates agent state, message history, and AI pipeline execution.
 */

import { useAgentState } from './useAgentState';
import { useMessageHistory } from './useMessageHistory';
import { useAgentPipeline } from './useAgentPipeline';

interface CoderLogicProps {
  apiKeys: Record<string, string>;
  lmStudioBaseUrl: string;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  ollamaModels: any[];
  lmStudioModels: any[];
  ollamaBaseUrl: string;
  activeAgent?: 'open' | 'claude' | 'nyx';
  setActiveAgent?: (agent: 'open' | 'claude' | 'nyx') => void;
  models?: Record<'open' | 'claude' | 'nyx', string>;
  setModel?: (modelId: string) => void;
}

export const useCoderLogic = ({
  apiKeys,
  lmStudioBaseUrl,
  modelSettings,
  trackUsage,
  ollamaModels,
  lmStudioModels,
  ollamaBaseUrl,
  activeAgent: propActiveAgent,
  setActiveAgent: propSetActiveAgent,
  models: propModels,
  setModel: propSetModel
}: CoderLogicProps) => {
  const {
    activeAgent,
    setActiveAgent,
    models,
    setModel,
    agentPersonas,
    setAgentPersonas
  } = useAgentState({
    activeAgent: propActiveAgent,
    setActiveAgent: propSetActiveAgent,
    models: propModels,
    setModel: propSetModel
  });

  const {
    historyMap,
    history,
    metrics,
    metricsMap,
    setMetricsMap,
    suggestedPrompts,
    setSuggestedPrompts,
    updateHistory,
    updateMetrics,
    clearHistory,
    getSuggestions
  } = useMessageHistory(activeAgent);

  const { isLoading, runCoder, stopCoder } = useAgentPipeline({
    activeAgent,
    models,
    apiKeys,
    agentPersonas,
    modelSettings,
    lmStudioBaseUrl,
    ollamaBaseUrl,
    ollamaModels,
    lmStudioModels,
    trackUsage,
    historyMap,
    updateHistory,
    updateMetrics,
    getSuggestions,
    setSuggestedPrompts
  });

  return {
    activeAgent,
    setActiveAgent,
    isLoading,
    history,
    metrics,
    models,
    setModel,
    runCoder,
    stopCoder,
    clearHistory,
    agentPersonas,
    suggestedPrompts
  };
};
