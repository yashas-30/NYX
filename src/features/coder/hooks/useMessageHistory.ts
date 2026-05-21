/**
 * @file src/features/coder/hooks/useMessageHistory.ts
 * @description Manages chat history, telemetry metrics, and suggested prompts per agent.
 */

import { useState, useCallback } from 'react';
import { ChatMessage, TelemetryMetrics } from '@/src/core/types';

type AgentKey = 'open' | 'claude' | 'nyx';

const emptyHistory: Record<AgentKey, ChatMessage[]> = { open: [], claude: [], nyx: [] };
const emptyMetrics: Record<AgentKey, TelemetryMetrics> = {
  open: { latency: 0, tokens: 0, tps: 0 },
  claude: { latency: 0, tokens: 0, tps: 0 },
  nyx: { latency: 0, tokens: 0, tps: 0 }
};

export const useMessageHistory = (activeAgent: AgentKey) => {
  const [historyMap, setHistoryMap] = useState<Record<AgentKey, ChatMessage[]>>(emptyHistory);
  const [metricsMap, setMetricsMap] = useState<Record<AgentKey, TelemetryMetrics>>(emptyMetrics);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);

  const history = historyMap[activeAgent];
  const metrics = metricsMap[activeAgent];

  const updateHistory = useCallback((agent: AgentKey, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setHistoryMap(prev => ({ ...prev, [agent]: updater(prev[agent]) }));
  }, []);

  const updateMetrics = useCallback((agent: AgentKey, newMetrics: TelemetryMetrics) => {
    setMetricsMap(prev => ({ ...prev, [agent]: newMetrics }));
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryMap(prev => ({ ...prev, [activeAgent]: [] }));
    setMetricsMap(prev => ({ ...prev, [activeAgent]: { latency: 0, tokens: 0, tps: 0 } }));
    setSuggestedPrompts([]);
  }, [activeAgent]);

  const getSuggestions = useCallback((history: ChatMessage[]) => {
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role === 'user') return;

    const content = lastMsg.content.toLowerCase();
    let suggestions = ['Explain this code', 'Add error handling', 'Write unit tests'];

    if (content.includes('react') || content.includes('component')) {
      suggestions = ['Add prop types', 'Convert to Tailwind', 'Add a loading state'];
    } else if (content.includes('api') || content.includes('fetch')) {
      suggestions = ['Add retry logic', 'Document the API', 'Mock this response'];
    }

    setSuggestedPrompts(suggestions);
  }, []);

  return {
    historyMap,
    setHistoryMap,
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
  };
};
