import { useCallback, useRef } from 'react';
import { ChatMessage, TelemetryMetrics } from '@src/infrastructure/types';

interface MetricsTrackerProps {
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
}

export const useMetricsTracker = ({ updateHistory, updateMetrics }: MetricsTrackerProps) => {
  const finalMetricsRef = useRef<TelemetryMetrics | null>(null);

  const processChunkMetrics = useCallback(
    (meta: any) => {
      // fallow-ignore-next-line code-duplication
      const tokens = meta.totalTokens || meta.tokens || meta.total_tokens || 0;
      const latency = meta.latencyMs || meta.latency || 0;
      const tps = meta.tokensPerSecond || meta.tps || (latency > 0 ? tokens / (latency / 1000) : 0);

      const mappedMetrics: TelemetryMetrics = {
        latency,
        tokens,
        tps,
        ttft: meta.ttft,
      };

      finalMetricsRef.current = mappedMetrics;

      updateHistory((prev) => {
        const h = [...prev];
        const last = h[h.length - 1];
        if (last?.role === 'assistant') {
          last.metrics = mappedMetrics;
        }
        return h;
      });

      updateMetrics(mappedMetrics);
    },
    [updateHistory, updateMetrics]
  );

  const getFinalMetrics = useCallback(() => {
    return finalMetricsRef.current;
  }, []);

  const clearMetrics = useCallback(() => {
    finalMetricsRef.current = null;
  }, []);

  return { processChunkMetrics, getFinalMetrics, clearMetrics };
};
