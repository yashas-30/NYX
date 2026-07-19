import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export interface LocalModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  specs: {
    contextWindow: string;
    maxOutput: string;
    modality: string;
  };
  status: string;
  capabilities?: {
    vision: boolean;
    reasoning: boolean;
  };
  [key: string]: any;
}

export function inferModelSpecs(idOrName: string) {
  const name = idOrName.toLowerCase();
  let contextWindow = '8K';
  let maxOutput = 'N/A';
  let modality = 'Text';

  if (name.includes('gemma-4') || name.includes('gemma4')) {
    contextWindow = '256K';
    maxOutput = '8K';
  } else if (name.includes('gemma-3') || name.includes('gemma3')) {
    contextWindow = '128K';
    maxOutput = '8K';
  } else if (name.includes('llama-3.3') || name.includes('llama3.3')) {
    contextWindow = '128K';
    maxOutput = '8K';
  } else if (name.includes('llama-3.2') || name.includes('llama3.2')) {
    contextWindow = '128K';
    maxOutput = '4K';
  } else if (name.includes('llama-3.1') || name.includes('llama3.1')) {
    contextWindow = '128K';
    maxOutput = '4K';
  } else if (name.includes('llama-3') || name.includes('llama3') || name.includes('qwen2.5') || name.includes('qwen-2.5') || name.includes('deepseek-r1') || name.includes('deepseek-v3')) {
    contextWindow = '128K';
    maxOutput = '4K';
  } else if (name.includes('llama-2') || name.includes('llama2') || name.includes('qwen2') || name.includes('qwen-2') || name.includes('mistral-7b-v0.3')) {
    contextWindow = '32K';
    maxOutput = '4K';
  } else if (name.includes('phi-4')) {
    contextWindow = '16K';
    maxOutput = '4K';
  } else if (name.includes('phi-3')) {
    contextWindow = '8K';
    maxOutput = '4K';
  } else if (name.includes('gemma-2') || name.includes('gemma2')) {
    contextWindow = '8K';
    maxOutput = '4K';
  }

  // Modality & Capabilities inference
  const isVision = name.includes('vl') || name.includes('vision') || name.includes('multimodal') || name.includes('pixtral') || name.includes('llava');
  const isReasoning = name.includes('r1') || name.includes('reasoning') || name.includes('thinking') || name.includes('o1') || name.includes('o3');

  if (isVision) {
    modality = 'Text + Vision';
  }

  // Extract quantization (e.g. Q4_K_M, Q8_0, f16)
  const quantMatch = name.match(/-(q[0-9a-z_]+|f16|f32)\.gguf$/i) || name.match(/_(q[0-9a-z_]+|f16|f32)\.gguf$/i);
  const quantization = quantMatch ? quantMatch[1].toUpperCase() : 'Unknown';

  return {
    quantization,
    contextWindow,
    maxOutput,
    modality,
    capabilities: {
      vision: isVision,
      reasoning: isReasoning,
    }
  };
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
            capabilities: specs.capabilities,
            status: m.status || 'completed',
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
