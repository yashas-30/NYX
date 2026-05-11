import { useState, useCallback } from 'react';
import { OllamaModel, LMStudioModel } from '@/src/types';
import { fetchOllamaModels as fetchOllamaModelsHelper } from '../../lib/state/ollamaHelpers';
import { fetchLMStudioModels } from '@/src/lib/api/lmStudioClient';

export const useModelRegistry = (initialLmStudioUrl: string) => {
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle');
  const [ollamaError, setOllamaError] = useState<string>('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>('http://localhost:11434');

  const [lmStudioModels, setLmStudioModels] = useState<LMStudioModel[]>([]);
  const [lmStudioStatus, setLmStudioStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle');
  const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState<string>(initialLmStudioUrl);

  const fetchOllamaModels = useCallback(async (urlOverride?: string) => {
    const targetUrl = urlOverride ?? ollamaBaseUrl;
    await fetchOllamaModelsHelper({
      setOllamaModels,
      setOllamaStatus,
      setOllamaError,
      targetUrl
    });
  }, [ollamaBaseUrl]);

  const fetchLMStudioModelsList = useCallback(async (urlOverride?: string) => {
    const targetUrl = urlOverride ?? lmStudioBaseUrl;
    setLmStudioStatus('loading');
    try {
      const models = await fetchLMStudioModels(targetUrl);
      setLmStudioModels(models);
      setLmStudioStatus('ok');
    } catch (err) {
      console.error('[Registry] LM Studio fetch failed:', err);
      setLmStudioStatus('error');
    }
  }, [lmStudioBaseUrl]);

  return {
    ollamaModels,
    ollamaStatus,
    ollamaError,
    fetchOllamaModels,
    ollamaBaseUrl,
    setOllamaBaseUrl,
    lmStudioModels,
    lmStudioStatus,
    lmStudioBaseUrl,
    setLmStudioBaseUrl,
    fetchLMStudioModels: fetchLMStudioModelsList
  };
};
