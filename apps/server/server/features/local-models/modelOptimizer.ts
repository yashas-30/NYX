import os from 'os';
import type { OptimizationProfile } from './modelTypes.js';

import { detectGPUs, calculateOptimalLayers, detectBackend } from './hardwareDetector.js';

// Re-export for backward compatibility — callers that import OptimizationProfile
// from this module continue to work without changes.
export type { OptimizationProfile } from './modelTypes.js';

export class ModelOptimizer {
  async generateProfile(
    modelId: string,
    taskType: 'chat' | 'code' | 'analysis',
    priority: 'speed' | 'quality' | 'balanced' = 'balanced'
  ): Promise<OptimizationProfile> {
    const gpus = await detectGPUs();
    const totalRam = os.totalmem();
    const cpuCores = os.cpus().length;

    // Base calculations from existing code
    const optimal = await calculateOptimalLayers(modelId, this.getContextSize(taskType, totalRam));

    const backendType = gpus.length > 0 ? ((await detectBackend()) as 'cuda' | 'vulkan') : 'cpu';

    // Task-specific adjustments
    const profile: OptimizationProfile = {
      taskType,
      gpuLayers: optimal.gpuLayers,
      contextSize: this.getContextSize(taskType, totalRam),
      batchSize: optimal.batchSize,
      threads: Math.max(1, Math.floor(cpuCores * 0.75)),
      quantization: this.getQuantization(priority, taskType),
      // Flash attention is only supported on CUDA, NOT on Vulkan backend (causes crashes).
      // Setting this correctly here prevents the runner from accidentally enabling it on Vulkan.
      useFlashAttn:
        backendType === 'cuda' && gpus.some((g) => g.vendor.toLowerCase().includes('nvidia')),
      // Vulkan backend crashes with quantized KV cache (q8_0/q4_0 causes GGML_SCHED_MAX_SPLIT_INPUTS error).
      // Use f16 KV cache for Vulkan; quantized KV cache is only safe on CUDA.
      kvCacheQuant: backendType === 'vulkan' ? 'f16' : priority === 'speed' ? 'q4_0' : 'q8_0',
      speculativeDecoding: this.shouldUseSpeculative(modelId, gpus),
      backend: backendType,
      estimatedTokensPerSecond: this.estimateSpeed(optimal.gpuLayers, optimal.totalLayers, gpus),
    };

    // Multi-GPU splitting
    if (gpus.length > 1 && profile.gpuLayers > 0) {
      const totalVram = gpus.reduce((sum, g) => sum + g.vramBytes, 0);
      profile.tensorSplit = gpus.map((g) => g.vramBytes / totalVram);
    }

    // Code generation: force higher quality quant
    if (taskType === 'code') {
      const minCodeQuant = 'Q4_K_M';
      const quantTiers = ['Q2_K', 'Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'];
      const currentIdx = quantTiers.indexOf(profile.quantization);
      const minIdx = quantTiers.indexOf(minCodeQuant);
      if (currentIdx < minIdx) {
        profile.quantization = minCodeQuant;
      }
    }

    return profile;
  }

  private getContextSize(taskType: string, totalRam: number): number {
    const ramGB = totalRam / 1024 ** 3;

    switch (taskType) {
      case 'chat':
        return ramGB >= 16 ? 8192 : 4096;
      case 'code':
        return ramGB >= 32 ? 16384 : ramGB >= 16 ? 8192 : 4096;
      case 'analysis':
        return ramGB >= 32 ? 32768 : 16384;
      default:
        return 4096;
    }
  }

  private getQuantization(priority: string, taskType: string): OptimizationProfile['quantization'] {
    if (taskType === 'code') {
      return priority === 'speed' ? 'Q4_K_M' : 'Q5_K_M';
    }
    if (priority === 'speed') return 'Q4_K_M';
    if (priority === 'quality') return 'Q8_0';
    return 'Q5_K_M';
  }

  private shouldUseSpeculative(modelId: string, gpus: any[]): boolean {
    // Only use speculative decoding if we have VRAM headroom
    const hasVramHeadroom = gpus.length > 0 && gpus[0].vramBytes > 6 * 1024 ** 3;
    const isLargeModel = modelId.includes('70b') || modelId.includes('32b');
    return hasVramHeadroom && !isLargeModel; // Large models don't benefit as much
  }

  private estimateSpeed(gpuLayers: number, totalLayers: number, gpus: any[]): number {
    const offloadRatio = gpuLayers / totalLayers;
    const hasDiscreteGPU = gpus.some((g) => {
      const m = g.model.toLowerCase();
      return m.includes('rtx') || m.includes('geforce') || m.includes('radeon');
    });

    if (!hasDiscreteGPU) return 2; // CPU-only: ~2 tok/s
    if (offloadRatio >= 1.0) return 30; // Full GPU: ~30 tok/s
    if (offloadRatio >= 0.5) return 15; // Hybrid: ~15 tok/s
    return 5; // Mostly CPU: ~5 tok/s
  }
}
