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

export function inferModelSpecs(idOrName: string) {
  const name = idOrName.toLowerCase();
  let trainingData = 'N/A';
  let contextWindow = '8K';
  let maxOutput = 'N/A';
  let modality = 'Text';

  if (name.includes('gemma-4') || name.includes('gemma4')) {
    trainingData = '2026';
    contextWindow = '256K';
    maxOutput = '8K';
  } else if (name.includes('gemma-3') || name.includes('gemma3')) {
    trainingData = '2025';
    contextWindow = '128K';
    maxOutput = '8K';
  } else if (name.includes('llama-3.3') || name.includes('llama3.3')) {
    trainingData = '2024';
    contextWindow = '128K';
    maxOutput = '8K';
  } else if (name.includes('llama-3.2') || name.includes('llama3.2')) {
    trainingData = '2024';
    contextWindow = '128K';
    maxOutput = '4K';
  } else if (name.includes('llama-3.1') || name.includes('llama3.1')) {
    trainingData = '2024';
    contextWindow = '128K';
    maxOutput = '4K';
  } else if (name.includes('llama-3') || name.includes('llama3') || name.includes('qwen2.5') || name.includes('qwen-2.5') || name.includes('deepseek-r1') || name.includes('deepseek-v3')) {
    trainingData = '2024';
    contextWindow = '128K';
    maxOutput = '4K';
  } else if (name.includes('llama-2') || name.includes('llama2') || name.includes('qwen2') || name.includes('qwen-2') || name.includes('mistral-7b-v0.3')) {
    trainingData = '2023';
    contextWindow = '32K';
    maxOutput = '4K';
  } else if (name.includes('phi-4')) {
    trainingData = '2024';
    contextWindow = '16K';
    maxOutput = '4K';
  } else if (name.includes('phi-3')) {
    trainingData = '2024';
    contextWindow = '8K';
    maxOutput = '4K';
  } else if (name.includes('gemma-2') || name.includes('gemma2')) {
    trainingData = '2024';
    contextWindow = '8K';
    maxOutput = '4K';
  }

  // Modality inference
  if (name.includes('vl') || name.includes('vision') || name.includes('multimodal')) {
    modality = 'Multimodal';
  }

  return { contextWindow, trainingData, maxOutput, modality };
}

export function useLocalModels(enabled: boolean = true) {
  return useQuery({
    queryKey: ['localModels'],
    queryFn: async () => {
      const [ollamaRes, lmstudioRes] = await Promise.allSettled([
        fetchWithAuth('/api/v1/nyx/local-models/ollama/models'),
        fetchWithAuth('/api/v1/models/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'lmstudio' })
        })
      ]);

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
              specs: inferModelSpecs(nameStr),
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
              specs: inferModelSpecs(idStr),
              status: 'completed'
            };
          });
        } catch (e) {}
      }

      return {
        ollamaModels,
        lmstudioModels,
      };
    },
    refetchInterval: enabled ? 30000 : false,
    enabled,
  });
}
