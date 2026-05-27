import { useState, useEffect, useCallback, useRef } from 'react';
import { AIService } from '@src/core/services/ai.service';
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

    const providers: string[] = [
      'gemini', 'openrouter', 'nvidia',
      'opencode', 'openai', 'anthropic', 'deepseek', 'groq',
      'mistral', 'together', 'nyx-native'
    ];
    const newStatuses: Record<string, Status> = {};

    await Promise.all(providers.map(async (p) => {
      const key = apiKeys[p];
      newStatuses[p] = await AIService.checkStatus(p, key);
    }));

    setStatuses(newStatuses);
  }, [apiKeys, localModelsEnabled]);

  useEffect(() => {
    checkAllStatuses();
    // Increased from 30s to 60s to reduce unnecessary network calls
    const interval = setInterval(checkAllStatuses, 60000);
    return () => clearInterval(interval);
  }, [checkAllStatuses]);

  return { statuses, refreshStatuses: checkAllStatuses };
};
