import fs from 'fs/promises';
import path from 'path';
import { MODELS_DIR } from '../../lib/paths.js';
import fsSync from 'fs';

export interface ModelMetadata {
  modelId: string;
  mmluScore?: number;
  humanEvalScore?: number;
  mtBenchScore?: number;
  lastUpdated?: string;
  sha256?: string;
  tags?: string[];
  ggufMetadata?: any;
}

export class ModelMetadataService {
  private static instance: ModelMetadataService;
  private cache: Map<string, ModelMetadata> = new Map();

  private constructor() { }

  public static getInstance(): ModelMetadataService {
    if (!ModelMetadataService.instance) {
      ModelMetadataService.instance = new ModelMetadataService();
    }
    return ModelMetadataService.instance;
  }

  // In a real production scenario, this would query the Hugging Face API or OpenLLM Leaderboard datasets.
  // For NYX, we'll simulate the metadata fetch for popular models.
  public async getMetadata(
    modelId: string,
    url?: string,
    fileName?: string
  ): Promise<ModelMetadata> {
    if (this.cache.has(modelId)) {
      return this.cache.get(modelId)!;
    }

    const metadata: ModelMetadata = {
      modelId,
      lastUpdated: new Date().toISOString(),
      tags: ['gguf', 'local'],
    };

    if (fileName) {
      // Local GGUF parsing removed as requested.
      // Metadata will now be handled by Ollama/LM Studio APIs.
    }

    // Simulated Leaderboard scores based on model name heuristic
    const lowerId = modelId.toLowerCase();

    if (lowerId.includes('llama-3.3-70b')) {
      metadata.mmluScore = 85.2;
      metadata.humanEvalScore = 79.5;
      metadata.mtBenchScore = 9.1;
    } else if (lowerId.includes('llama-3.1-8b') || lowerId.includes('llama-3-8b')) {
      metadata.mmluScore = 68.4;
      metadata.humanEvalScore = 62.1;
      metadata.mtBenchScore = 7.9;
    } else if (lowerId.includes('gemma-2-9b')) {
      metadata.mmluScore = 71.3;
      metadata.humanEvalScore = 60.5;
      metadata.mtBenchScore = 8.1;
    } else if (lowerId.includes('gemma-4-26b') || lowerId.includes('gemma-4-26b')) {
      metadata.mmluScore = 75.2;
      metadata.humanEvalScore = 68.9;
      metadata.mtBenchScore = 8.4;
    } else if (lowerId.includes('qwen2.5-coder-32b')) {
      metadata.mmluScore = 78.9;
      metadata.humanEvalScore = 88.2;
      metadata.mtBenchScore = 8.6;
    } else if (lowerId.includes('qwen2.5-coder-7b')) {
      metadata.mmluScore = 69.5;
      metadata.humanEvalScore = 79.8;
      metadata.mtBenchScore = 7.8;
    } else if (lowerId.includes('deepseek-r1-distill-llama-70b')) {
      metadata.mmluScore = 87.1;
      metadata.humanEvalScore = 89.5;
      metadata.mtBenchScore = 9.3;
    } else if (lowerId.includes('deepseek-r1')) {
      metadata.mmluScore = 81.0;
      metadata.humanEvalScore = 85.0;
      metadata.mtBenchScore = 8.9;
    } else {
      // Default baseline
      metadata.mmluScore = 60.0;
      metadata.humanEvalScore = 50.0;
      metadata.mtBenchScore = 7.0;
    }

    // Try to fetch upstream SHA if it's a HuggingFace URL
    if (url && url.includes('huggingface.co')) {
      try {
        // e.g. https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf
        // We can hit the HF API for commit info if needed, but for now we mock it.
        metadata.sha256 = 'simulated_sha256_hash_for_' + modelId;
      } catch (err) {
        console.warn(`[Metadata] Failed to fetch upstream SHA for ${modelId}`);
      }
    }

    this.cache.set(modelId, metadata);
    return metadata;
  }
}

export const modelMetadataService = ModelMetadataService.getInstance();
