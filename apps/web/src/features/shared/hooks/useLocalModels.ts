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
      const res = await fetchWithAuth('/api/v1/nyx/local-models');
      if (!res.ok) {
        throw new Error('Failed to fetch local models');
      }
      const data = await res.json();
      
      const models = data.models || [];
      const completed = models
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

      return {
        models,
        completed,
        activeModelId: data.activeModelId || null,
        runnerStatus: data.runnerStatus || { status: 'stopped', error: null },
      };
    },
    refetchInterval: enabled ? 30000 : false,
    enabled,
  });
}
