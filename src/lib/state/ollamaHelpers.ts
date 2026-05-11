import { Dispatch, SetStateAction } from 'react';
import { OllamaModel } from '@/src/types';

export interface FetchOllamaOptions {
  setOllamaModels: Dispatch<SetStateAction<OllamaModel[]>>;
  setOllamaStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'error' | 'ok'>>;
  setOllamaError: Dispatch<SetStateAction<string>>;
  targetUrl?: string;
}

export const fetchOllamaModels = async ({
  setOllamaModels,
  setOllamaStatus,
  setOllamaError,
  targetUrl = 'http://localhost:11434'
}: FetchOllamaOptions) => {
  setOllamaStatus('loading');
  setOllamaError('');

  try {
    // If it's localhost, we can try to fetch directly if CORS is set up,
    // otherwise we use our local proxy but that proxy needs to know the target.
    // For now, let's try direct fetch to the targetUrl.
    const res = await fetch(`${targetUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: OllamaModel[]; error?: string };
    if (data.error) throw new Error(data.error);
    setOllamaModels(data.models ?? []);
    setOllamaStatus('ok');
  } catch (e: any) {
    setOllamaError(e.message || 'Could not reach Ollama');
    setOllamaStatus('error');
    setOllamaModels([]);
  }
};
