/**
 * @file server/features/local-models/modelTypes.ts
 * @description Shared types for local model optimization to avoid circular imports.
 */

export interface OptimizationProfile {
  taskType: 'chat' | 'code' | 'analysis';
  gpuLayers: number;
  contextSize: number;
  batchSize: number;
  threads: number;
  quantization: 'Q2_K' | 'Q3_K_M' | 'Q4_K_M' | 'Q5_K_M' | 'Q6_K' | 'Q8_0';
  useFlashAttn: boolean;
  kvCacheQuant: 'f16' | 'q8_0' | 'q4_0';
  speculativeDecoding: boolean;
  draftModelPath?: string;
  tensorSplit?: number[];
  backend: 'cuda' | 'vulkan' | 'cpu';
  estimatedTokensPerSecond: number;
}
