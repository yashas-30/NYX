import { useState, useEffect, useCallback, useRef } from 'react';
import { AIService } from '@src/features/ai/services/ai.service';
import { Provider } from '@src/infrastructure/types';

export type Status = 'online' | 'offline' | 'no-key';

export const useProviderStatus = (
  apiKeys: Record<string, string>,
  localModelsEnabled?: boolean
) => {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const isVisibleRef = useRef(true);

  // Track page visibility to skip polling when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const checkAllStatuses = useCallback(async () => {
    // Skip polling when tab is hidden (performance optimization)
    if (!isVisibleRef.current) return;

    const providers: string[] = ['gemini', 'openrouter', 'groq', 'deepseek', 'anthropic', 'openai'];
    const newStatuses: Record<string, Status> = {};

    await Promise.all(
      providers.map(async (p) => {
        const key = apiKeys[p];
        newStatuses[p] = await AIService.checkStatus(p, key);
      })
    );

    setStatuses(newStatuses);
  }, [apiKeys, localModelsEnabled]);

  useEffect(() => {
    checkAllStatuses();
    // Increased to 5 minutes (300,000ms) to avoid consuming free-tier API quotas
    const interval = setInterval(checkAllStatuses, 300000);
    return () => clearInterval(interval);
  }, [checkAllStatuses]);

  return { statuses, refreshStatuses: checkAllStatuses };
};
