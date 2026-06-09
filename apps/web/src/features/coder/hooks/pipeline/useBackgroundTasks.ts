import { useCallback, useState, useEffect } from 'react';
import { triggerCritic, triggerMemoryCommit } from '@src/infrastructure/api/coderApi';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';

interface BackgroundTasksProps {
  models: Record<string, string>;
  apiKeys: Record<string, string>;
}

export const useBackgroundTasks = ({ models, apiKeys }: BackgroundTasksProps) => {
  const [criticStatus, setCriticStatus] = useState<'idle' | 'learning' | 'completed' | 'failed'>('idle');
  const [criticResult, setCriticResult] = useState<any>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      eventSource = new EventSource('/api/v1/nyx/critic/stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') setCriticStatus('learning');
          if (data.type === 'completed') {
            setCriticStatus('completed');
            setCriticResult(data.result);
            setTimeout(() => setCriticStatus('idle'), 5000);
          }
          if (data.type === 'failed') {
            setCriticStatus('failed');
            setTimeout(() => setCriticStatus('idle'), 5000);
          }
          // Reset backoff on successful message
          attempt = 0;
        } catch (err) {
          console.error('[Critic Stream] Error parsing SSE data:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (!destroyed) {
          // Exponential backoff: 2s → 4s → 8s → cap at 30s
          attempt++;
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    // Delay initial connection by 2s to avoid hitting the server before it's ready
    reconnectTimer = setTimeout(connect, 2000);

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, []);


  // fallow-ignore-next-line code-duplication
  const triggerBackgroundCritic = useCallback(
    async (prompt: string, responseText: string, complexity?: string) => {
      // Skip critic for trivial/simple prompts — saves tokens and reduces noise
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
        console.error('[useBackgroundTasks] Background critic failed:', err);
      }
    },
    [models, apiKeys]
  );

  const commitToMemory = useCallback(
    (prompt: string, responseText: string) => {
      const nyxModel = models['nyx'];
      if (!nyxModel) return;
      const nyxProvider = detectProvider(nyxModel);

      // Asynchronously trigger memory keeper commit
      triggerMemoryCommit({
        prompt,
        response: responseText,
        provider: nyxProvider,
        modelId: nyxModel,
        agentType: 'code',
      }).catch((err: any) => {
        console.warn('[Coder Pipeline] Memory keeper commit failed:', err);
      });
    },
    [models]
  );

  return { triggerBackgroundCritic, commitToMemory, criticStatus, criticResult };
};
