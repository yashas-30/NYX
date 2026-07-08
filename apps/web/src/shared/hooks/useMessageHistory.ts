/**
 * @file src/features/coder/hooks/useMessageHistory.ts
 * @description Manages chat telemetry metrics and suggested prompts.
 */

import { useState, useCallback } from 'react';
import { ChatMessage, TelemetryMetrics } from '@src/infrastructure/types';

export const useMessageHistory = () => {
  const [metrics, setMetrics] = useState<TelemetryMetrics>({ latency: 0, tokens: 0, tps: 0 });
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);

  const updateMetrics = useCallback((newMetrics: TelemetryMetrics) => {
    setMetrics(newMetrics);
  }, []);

  const clearMetrics = useCallback(() => {
    setMetrics({ latency: 0, tokens: 0, tps: 0 });
    setSuggestedPrompts([]);
  }, []);

  const getSuggestions = useCallback((history: ChatMessage[]) => {
    setSuggestedPrompts([]);
  }, []);

  return {
    metrics,
    suggestedPrompts,
    setSuggestedPrompts,
    updateMetrics,
    clearMetrics,
    getSuggestions,
  };
};
