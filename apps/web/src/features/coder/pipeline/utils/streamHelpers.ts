import { ChatMessage, TelemetryMetrics } from '@src/infrastructure/types';
import { countTokens } from '@src/core/services/ai.service';

export function createStreamUpdate(
  startTime: number,
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  updateMetrics: (metrics: TelemetryMetrics) => void
) {
  return (text: string) => {
    const now = Date.now();
    const elapsed = now - startTime;
    const tokens = countTokens(text);
    const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;
    const currentMetrics = { latency: elapsed, tokens, tps };
    updateHistory((prev) => {
      const h = [...prev];
      const last = h[h.length - 1];
      if (last && last.role === 'assistant') {
        last.content = text;
        last.metrics = currentMetrics;
      }
      return h;
    });
    updateMetrics(currentMetrics);
  };
}
