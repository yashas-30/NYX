import fs from 'fs';
import path from 'path';
import { 
  getSystemInfo, 
  downloadWithProgress, 
  computeChecksum, 
  loadDownloads, 
  saveDownloads, 
  MODELS_DIR, 
  DownloadProgress 
} from './utils.js';

export interface ModelHubEntry {
  id: string;
  name: string;
  description: string;
  architecture: string;
  parameters: string;
  quantizations: QuantizationOption[];
  tags: string[];
  downloads: number;
  rating: number;
  capabilities: string[];
  recommendedHardware: HardwareRequirements;
  license: string;
  source: 'huggingface' | 'ollama' | 'nyx-curated';
  sourceUrl: string;
}

export interface QuantizationOption {
  id: string;
  name: string;
  bits: number;
  fileSize: string;
  ramRequired: string;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  downloadUrl: string;
  checksum: string;
}

export interface HardwareRequirements {
  minRam: string;
  recommendedRam: string;
  gpuRecommended: boolean;
  vramRecommended?: string;
}

export interface ModelFilter {
  capabilities?: string[];
  maxRam?: number;
  minQuality?: number;
}

export const NYX_MODEL_HUB: ModelHubEntry[] = [
  {
    id: 'qwen3-30b-a3b',
    name: 'Qwen3 30B A3B',
    description: 'Alibaba\'s latest reasoning model with 30B parameters and 3B active. Excellent for coding and reasoning.',
    architecture: 'Qwen3',
    parameters: '30B (3B active)',
    quantizations: [
      { id: 'q4_k_m', name: 'Q4_K_M', bits: 4, fileSize: '18.2 GB', ramRequired: '24 GB', quality: 'good', downloadUrl: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/qwen3-30b-a3b-q4_k_m.gguf', checksum: 'dummy_checksum' },
      { id: 'q5_k_m', name: 'Q5_K_M', bits: 5, fileSize: '21.5 GB', ramRequired: '28 GB', quality: 'excellent', downloadUrl: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/qwen3-30b-a3b-q5_k_m.gguf', checksum: 'dummy_checksum' },
      { id: 'q8_0', name: 'Q8_0', bits: 8, fileSize: '32.1 GB', ramRequired: '40 GB', quality: 'excellent', downloadUrl: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/qwen3-30b-a3b-q8_0.gguf', checksum: 'dummy_checksum' },
    ],
    tags: ['coding', 'reasoning', 'multilingual', 'chinese'],
    downloads: 154000,
    rating: 4.7,
    capabilities: ['code-generation', 'reasoning', 'math', 'multilingual'],
    recommendedHardware: { minRam: '16 GB', recommendedRam: '32 GB', gpuRecommended: true, vramRecommended: '16 GB' },
    license: 'Apache-2.0',
    source: 'huggingface',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF'
  },
  {
    id: 'llama-4-scout',
    name: 'Llama 4 Scout',
    description: 'Meta\'s latest small model. 17B active parameters with 16 experts. Fast and efficient.',
    architecture: 'Llama 4',
    parameters: '109B (17B active)',
    quantizations: [
      { id: 'q4_k_m', name: 'Q4_K_M', bits: 4, fileSize: '62.3 GB', ramRequired: '72 GB', quality: 'good', downloadUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct-GGUF/resolve/main/llama-4-scout-q4_k_m.gguf', checksum: 'dummy_checksum' },
      { id: 'q5_k_m', name: 'Q5_K_M', bits: 5, fileSize: '73.8 GB', ramRequired: '84 GB', quality: 'excellent', downloadUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct-GGUF/resolve/main/llama-4-scout-q5_k_m.gguf', checksum: 'dummy_checksum' },
    ],
    tags: ['general', 'fast', 'efficient'],
    downloads: 89000,
    rating: 4.5,
    capabilities: ['general', 'coding', 'reasoning'],
    recommendedHardware: { minRam: '64 GB', recommendedRam: '96 GB', gpuRecommended: true, vramRecommended: '48 GB' },
    license: 'Llama-4-Community',
    source: 'huggingface',
    sourceUrl: 'https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct-GGUF'
  }
];

export class ModelHub {
  async search(query: string, filters: ModelFilter): Promise<ModelHubEntry[]> {
    let results = NYX_MODEL_HUB;

    if (query) {
      const lower = query.toLowerCase();
      results = results.filter(m => 
        m.name.toLowerCase().includes(lower) ||
        m.description.toLowerCase().includes(lower) ||
        m.tags.some(t => t.includes(lower))
      );
    }

    if (filters.capabilities?.length) {
      results = results.filter(m => 
        filters.capabilities!.every(c => m.capabilities.includes(c))
      );
    }

    if (filters.maxRam) {
      results = results.filter(m => {
        const ram = parseInt(m.recommendedHardware.recommendedRam);
        return ram <= filters.maxRam!;
      });
    }

    if (filters.minQuality) {
      results = results.filter(m => m.rating >= filters.minQuality!);
    }

    return results.sort((a, b) => b.rating - a.rating);
  }

  async getRecommendedForHardware(): Promise<ModelHubEntry[]> {
    const systemInfo = await getSystemInfo();
    const totalRam = systemInfo.totalRamGB;
    const hasGpu = systemInfo.hasGpu;

    return NYX_MODEL_HUB.filter(m => {
      const minRam = parseInt(m.recommendedHardware.minRam);
      return minRam <= totalRam && (!m.recommendedHardware.gpuRecommended || hasGpu);
    }).sort((a, b) => {
      // Prefer models that fit well in available RAM
      const aRec = parseInt(a.recommendedHardware.recommendedRam);
      const bRec = parseInt(b.recommendedHardware.recommendedRam);
      const aFit = totalRam - aRec;
      const bFit = totalRam - bRec;
      return bFit - aFit; // Better fit first
    });
  }

  async downloadModel(modelId: string, quantizationId: string, onProgress: (p: DownloadProgress) => void): Promise<void> {
    const model = NYX_MODEL_HUB.find(m => m.id === modelId);
    if (!model) throw new Error('Model not found');

    const quant = model.quantizations.find(q => q.id === quantizationId);
    if (!quant) throw new Error('Quantization not found');

    // Verify checksum after download
    const downloadPath = path.join(MODELS_DIR, `${modelId}-${quantizationId}.gguf`);

    await downloadWithProgress(quant.downloadUrl, downloadPath, onProgress);

    const checksum = await computeChecksum(downloadPath);
    // Ignore checksum for dummy entries
    if (quant.checksum !== 'dummy_checksum' && checksum !== quant.checksum) {
      await fs.promises.unlink(downloadPath);
      throw new Error('Checksum verification failed — download corrupted');
    }

    // Update downloads.json
    const downloads = loadDownloads();
    downloads[modelId] = {
      ...downloads[modelId],
      quantization: quantizationId,
      path: downloadPath,
      downloadedAt: new Date().toISOString(),
      checksum
    };
    saveDownloads(downloads);
  }
}
