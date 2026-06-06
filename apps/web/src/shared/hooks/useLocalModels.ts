import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

export interface LocalModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  specs: {
    contextWindow: string;
    trainingData: string;
    maxOutput: string;
    modality: string;
  };
  status: string;
  [key: string]: any;
}

export function useLocalModels(enabled: boolean = true) {
  return useQuery({
    queryKey: ['localModels'],
    queryFn: async () => {
      const [nyxRes, ollamaRes, lmstudioRes] = await Promise.allSettled([
        fetchWithAuth('/api/v1/nyx/local-models'),
        fetchWithAuth('/api/v1/nyx/local-models/ollama/models'),
        fetchWithAuth('/api/v1/models/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'lmstudio' })
        })
      ]);

      let models = [];
      let completed = [];
      let activeModelId = null;
      let runnerStatus = { status: 'stopped', error: null };

      if (nyxRes.status === 'fulfilled' && nyxRes.value.ok) {
        try {
          const data = await nyxRes.value.json();
          models = data.models || [];
          completed = models
            .filter((m: any) => m.status === 'completed' || m.status === 'downloading')
            .map((m: any) => ({
              id: m.id,
              name: m.name,
              provider: 'nyx-native',
              description: m.description || `Local GGUF model (${m.size || ''})`,
              specs: {
                contextWindow: m.contextLength || '8K',
                trainingData: 'N/A',
                maxOutput: 'N/A',
                modality: 'Text',
              },
              status: m.status,
            }));
          activeModelId = data.activeModelId || null;
          runnerStatus = data.runnerStatus || { status: 'stopped', error: null };
        } catch (e) {}
      }

      let ollamaModels = [];
      if (ollamaRes.status === 'fulfilled' && ollamaRes.value.ok) {
        try {
          const oData = await ollamaRes.value.json();
          ollamaModels = (oData.models || oData || []).map((m: any) => {
            const nameStr = typeof m === 'string' ? m : (m.name || m.id || JSON.stringify(m));
            return {
              id: `ollama/${nameStr}`,
              name: nameStr.replace('ollama/', ''),
              provider: 'ollama',
              description: 'Ollama local model',
              specs: { contextWindow: '8K', trainingData: 'N/A', maxOutput: 'N/A', modality: 'Text' },
              status: 'completed'
            };
          });
        } catch (e) {}
      }

      let lmstudioModels = [];
      if (lmstudioRes.status === 'fulfilled' && lmstudioRes.value.ok) {
        try {
          const lData = await lmstudioRes.value.json();
          lmstudioModels = (lData.models || []).map((m: any) => {
            const idStr = typeof m === 'string' ? m : (m.id || m.key || m.name || JSON.stringify(m));
            const nameStr = typeof m === 'string' ? m : (m.name || m.display_name || m.id || m.key || JSON.stringify(m));
            return {
              id: idStr,
              name: nameStr.replace('lmstudio/', ''),
              provider: 'lmstudio',
              description: 'LM Studio local model',
              specs: { contextWindow: '8K', trainingData: 'N/A', maxOutput: 'N/A', modality: 'Text' },
              status: 'completed'
            };
          });
        } catch (e) {}
      }

      return {
        models,
        completed,
        ollamaModels,
        lmstudioModels,
        activeModelId,
        runnerStatus,
      };
    },
    refetchInterval: enabled ? 30000 : false,
    enabled,
  });
}
