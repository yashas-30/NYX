import { useState, useEffect, useCallback } from 'react';
import { AIService } from '../../core/services/ai.service';
import { Provider } from '../../core/types';

export type Status = 'online' | 'offline' | 'no-key';

export const useProviderStatus = (apiKeys: Record<string, string>, lmStudioBaseUrl: string, ollamaBaseUrl: string) => {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  const checkAllStatuses = useCallback(async () => {
    const providers: Provider[] = ['gemini', 'openrouter', 'nvidia', 'ollama', 'lmstudio'];
    const newStatuses: Record<string, Status> = {};

    await Promise.all(providers.map(async (p) => {
      newStatuses[p] = await AIService.checkStatus(p, apiKeys[p], { lmStudioBaseUrl, ollamaBaseUrl });
    }));

    setStatuses(newStatuses);
  }, [apiKeys, lmStudioBaseUrl, ollamaBaseUrl]);

  useEffect(() => {
    checkAllStatuses();
    const interval = setInterval(checkAllStatuses, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [checkAllStatuses]);

  return { statuses, refreshStatuses: checkAllStatuses };
};
