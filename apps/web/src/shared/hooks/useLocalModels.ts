import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

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
      try {
        const models: any[] = await invoke('list_local_models');
        const formattedModels = models.map(m => {
          const specs = inferModelSpecs(m.name);
          return {
            ...m,
            specs: {
              ...specs,
              size: (m.size_bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
            },
            status: 'online',
            features: ['Local', 'GGUF'],
            pros: ['Private', 'Fast', 'No Cloud'],
            cons: ['Requires RAM/VRAM']
          };
        });
        return { models: formattedModels };
      } catch (e) {
        console.error('Failed to fetch local models', e);
        return { models: [] };
      }
    },
    refetchInterval: enabled ? 30000 : false,
    enabled,
  });
}
