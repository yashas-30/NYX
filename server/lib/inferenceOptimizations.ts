import { LocalModelInstance } from './localServer';

export class InferenceOptimizations {
  /**
   * Fires a dummy prompt to the local server right after it starts to prime the KV cache,
   * avoiding a high latency hit for the first real user request.
   */
  static async warmupKVCache(instance: LocalModelInstance): Promise<boolean> {
    try {
      console.log(
        `[Optimization] Warming up KV cache for instance ${instance.id} on port ${instance.port}...`
      );

      const response = await fetch(`http://127.0.0.1:${instance.port}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Hello',
          n_predict: 1,
        }),
      });

      if (response.ok) {
        console.log(`[Optimization] KV cache warm-up complete for instance ${instance.id}`);
        return true;
      }
      return false;
    } catch (e) {
      console.warn(`[Optimization] Failed to warmup KV cache:`, e);
      return false;
    }
  }

  /**
   * Translates UI configuration to llama.cpp specific quantization flags for KV Cache
   */
  static getKVCacheQuantizationFlag(level: 'none' | 'q8_0' | 'q4_0'): string[] {
    switch (level) {
      case 'q8_0':
        return ['--ctk', 'q8_0', '--ctv', 'q8_0'];
      case 'q4_0':
        return ['--ctk', 'q4_0', '--ctv', 'q4_0'];
      default:
        return [];
    }
  }

  /**
   * Prepares Tensor Parallelism flags for multi-GPU setups.
   */
  static getTensorParallelismFlags(gpuCount: number): string[] {
    if (gpuCount > 1) {
      return ['--tensor-split', new Array(gpuCount).fill('1').join(',')];
    }
    return [];
  }
}
