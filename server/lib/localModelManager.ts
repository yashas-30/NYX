import fs from 'fs';
import path from 'path';
import https from 'https';
import { IncomingMessage } from 'http';

export interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  size: string;
  url: string;
  fileName: string;
  description: string;
  ramRequired: string;
  vramRequired?: string;
  paramCount?: string;
  quantization?: string;
  contextLength?: string;
  featured?: boolean;
}

export const MODEL_PRESETS: ModelPreset[] = [

  // ── GOOGLE ──────────────────────────────────────────────────────────────
  {
    id: 'nyx-gemma-4-e2b-it',
    name: 'Gemma 4 E2B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '2.3B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '1.6 GB',
    url: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf',
    fileName: 'google_gemma-4-E2B-it-Q4_K_M.gguf',
    description: 'Ultra-efficient Google Gemma 4 edge model — the NYX native agent brain. Fast, smart, runs entirely on-device.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM',
    featured: true
  },
  {
    id: 'gemma-3-4b-it',
    name: 'Gemma 3 4B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '4B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.5 GB',
    url: 'https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-4b-it-Q4_K_M.gguf',
    description: 'Google\'s Gemma 3 4B with 128K context window. Excellent general assistant capabilities in a compact footprint.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  },
  {
    id: 'gemma-3-12b-it',
    name: 'Gemma 3 12B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '12B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '7.3 GB',
    url: 'https://huggingface.co/bartowski/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-12b-it-Q4_K_M.gguf',
    description: 'Google\'s mid-size Gemma 3 — powerful reasoning and coding with a massive 128K context window.',
    ramRequired: '12 GB RAM',
    vramRequired: '8 GB VRAM'
  },

  // ── META ─────────────────────────────────────────────────────────────────
  {
    id: 'llama-3.2-1b-native',
    name: 'Llama 3.2 1B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '1B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '0.8 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    description: 'Blazing fast 1B Meta model — perfect for edge devices and rapid completion tasks with minimal RAM footprint.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM'
  },
  {
    id: 'llama-3.2-3b-native',
    name: 'Llama 3.2 3B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '3B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.0 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    description: 'Meta\'s capable 3B general instruction model — great all-rounder for conversations and reasoning at any scale.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM'
  },
  {
    id: 'llama-3.1-8b-native',
    name: 'Llama 3.1 8B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '4.9 GB',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    fileName: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    description: 'The iconic Llama 3.1 8B — Meta\'s workhorse model with outstanding instruction following and 128K context.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM',
    featured: true
  },
  {
    id: 'llama-3.3-70b-native',
    name: 'Llama 3.3 70B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '70B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '42.5 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.3-70B-Instruct-Q4_K_M.gguf',
    description: 'Meta\'s flagship 70B — frontier-class intelligence rivaling GPT-4. Requires high-end hardware.',
    ramRequired: '48 GB RAM',
    vramRequired: '24 GB VRAM'
  },

  // ── MICROSOFT ────────────────────────────────────────────────────────────
  {
    id: 'phi-4-mini-instruct',
    name: 'Phi-4 Mini Instruct (Q4_K_M)',
    provider: 'microsoft',
    paramCount: '3.8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.5 GB',
    url: 'https://huggingface.co/bartowski/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
    fileName: 'Phi-4-mini-instruct-Q4_K_M.gguf',
    description: 'Microsoft\'s Phi-4 Mini — punches well above its weight with exceptional math and coding capabilities.',
    ramRequired: '4 GB RAM',
    vramRequired: '3 GB VRAM',
    featured: true
  },
  {
    id: 'phi-4-instruct',
    name: 'Phi-4 Instruct (Q4_K_M)',
    provider: 'microsoft',
    paramCount: '14B',
    quantization: 'Q4_K_M',
    contextLength: '16K',
    size: '8.4 GB',
    url: 'https://huggingface.co/bartowski/phi-4-GGUF/resolve/main/phi-4-Q4_K_M.gguf',
    fileName: 'phi-4-Q4_K_M.gguf',
    description: 'Microsoft\'s Phi-4 full model — state-of-the-art STEM reasoning and coding in the 14B class.',
    ramRequired: '12 GB RAM',
    vramRequired: '8 GB VRAM'
  },

  // ── QWEN (ALIBABA) ───────────────────────────────────────────────────────
  {
    id: 'qwen2.5-coder-1.5b-native',
    name: 'Qwen 2.5 Coder 1.5B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '1.5B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '1.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    description: 'Fast, lightweight Qwen model purpose-built for coding. Runs on virtually any device.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM'
  },
  {
    id: 'qwen2.5-coder-3b-native',
    name: 'Qwen 2.5 Coder 3B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '3B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '2.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    description: 'The best 3B code specialist — outperforms models twice its size on competitive coding benchmarks.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM',
    featured: true
  },
  {
    id: 'qwen2.5-coder-7b-native',
    name: 'Qwen 2.5 Coder 7B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '4.7 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    description: 'Qwen\'s flagship 7B code model — one of the strongest open-source code models available.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'qwen2.5-7b-native',
    name: 'Qwen 2.5 7B Instruct (Q4_K_M)',
    provider: 'qwen',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '4.7 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    description: 'Versatile Qwen 2.5 general model — excellent at multilingual tasks, analysis, and long-context comprehension.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'qwen3-8b-native',
    name: 'Qwen 3 8B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '5.2 GB',
    url: 'https://huggingface.co/bartowski/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
    fileName: 'Qwen3-8B-Q4_K_M.gguf',
    description: 'Qwen 3 8B — Alibaba\'s latest generation model with enhanced reasoning and instruction following.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },

  // ── DEEPSEEK ─────────────────────────────────────────────────────────────
  {
    id: 'deepseek-r1-distill-qwen-1.5b',
    name: 'DeepSeek R1 Distill Qwen 1.5B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '1.5B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '1.1 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    description: 'DeepSeek R1\'s chain-of-thought reasoning distilled into a tiny 1.5B model. Remarkable reasoning at tiny scale.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM',
    featured: true
  },
  {
    id: 'deepseek-r1-distill-qwen-7b',
    name: 'DeepSeek R1 Distill Qwen 7B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '4.7 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    description: 'DeepSeek R1 reasoning distilled into 7B — solves complex math, logic and code with visible chain-of-thought.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'deepseek-r1-distill-llama-8b',
    name: 'DeepSeek R1 Distill Llama 8B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '4.9 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
    description: 'DeepSeek\'s R1 reasoning transferred into Llama architecture — the best open reasoning model for 8 GB machines.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },

  // ── MISTRAL ──────────────────────────────────────────────────────────────
  {
    id: 'mistral-7b-v0.3',
    name: 'Mistral 7B v0.3 Instruct (Q4_K_M)',
    provider: 'mistral',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '4.4 GB',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    fileName: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    description: 'The gold-standard 7B open model. Mistral 7B set the benchmark for what small models could do.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM',
    featured: true
  },
  {
    id: 'mixtral-8x7b-instruct',
    name: 'Mixtral 8×7B Instruct (Q2_K)',
    provider: 'mistral',
    paramCount: '46.7B (MoE)',
    quantization: 'Q2_K',
    contextLength: '32K',
    size: '19.4 GB',
    url: 'https://huggingface.co/TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF/resolve/main/mixtral-8x7b-instruct-v0.1.Q2_K.gguf',
    fileName: 'mixtral-8x7b-instruct-v0.1.Q2_K.gguf',
    description: 'Mistral\'s legendary Mixture-of-Experts model — 8 experts, 2 active per token. GPT-3.5 quality on consumer hardware.',
    ramRequired: '24 GB RAM',
    vramRequired: '16 GB VRAM'
  },

  // ── OPENCHAT / COMMUNITY ─────────────────────────────────────────────────
  {
    id: 'openchat-3.5-7b',
    name: 'OpenChat 3.5 7B (Q4_K_M)',
    provider: 'openchat',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '4.4 GB',
    url: 'https://huggingface.co/TheBloke/openchat_3.5-GGUF/resolve/main/openchat_3.5.Q4_K_M.gguf',
    fileName: 'openchat_3.5.Q4_K_M.gguf',
    description: 'OpenChat 3.5 — breakthrough fine-tune that outperformed ChatGPT-3.5 on many benchmarks when released.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  },
  {
    id: 'codellama-7b-instruct',
    name: 'Code Llama 7B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '16K',
    size: '4.1 GB',
    url: 'https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf',
    fileName: 'codellama-7b-instruct.Q4_K_M.gguf',
    description: 'Meta\'s specialized Code Llama — purpose-built for code generation, completion, and debugging tasks.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  },

  // ── NVIDIA ───────────────────────────────────────────────────────────────
  {
    id: 'nemotron-mini-4b',
    name: 'Nemotron Mini 4B Instruct (Q4_K_M)',
    provider: 'nvidia',
    paramCount: '4B',
    quantization: 'Q4_K_M',
    contextLength: '4K',
    size: '2.8 GB',
    url: 'https://huggingface.co/bartowski/Nemotron-Mini-4B-Instruct-GGUF/resolve/main/Nemotron-Mini-4B-Instruct-Q4_K_M.gguf',
    fileName: 'Nemotron-Mini-4B-Instruct-Q4_K_M.gguf',
    description: 'NVIDIA\'s Nemotron Mini — optimized for enterprise inference with strong instruction following.',
    ramRequired: '4 GB RAM',
    vramRequired: '3 GB VRAM'
  },
];

export interface DownloadProgress {
  modelId: string;
  status: 'idle' | 'downloading' | 'completed' | 'failed';
  bytesDownloaded: number;
  totalBytes: number;
  progressPercentage: number;
  speedMbps: number;
  error?: string;
}

const BASE_DIR = path.join(process.cwd(), '.nyx-models');
const MODELS_DIR = path.join(BASE_DIR, 'models');
const STATE_FILE = path.join(BASE_DIR, 'downloads.json');

// Ensure directories exist
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Active downloads map
const activeDownloads = new Map<string, DownloadProgress>();
let downloadStates: Record<string, 'idle' | 'downloading' | 'completed' | 'failed'> = {};

// Load states from disk if exists
try {
  if (fs.existsSync(STATE_FILE)) {
    downloadStates = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
} catch (e) {
  console.error('Error loading model download state file:', e);
}

function saveStates() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(downloadStates, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving model download state file:', e);
  }
}

export const LocalModelManager = {
  getModelsDir() {
    return MODELS_DIR;
  },

  getPresets() {
    return MODEL_PRESETS;
  },

  listModels() {
    return MODEL_PRESETS.map(preset => {
      const filePath = path.join(MODELS_DIR, preset.fileName);
      const exists = fs.existsSync(filePath);

      let status: 'idle' | 'downloading' | 'completed' | 'failed' = 'idle';
      let fileSizeBytes = 0;

      if (exists) {
        status = 'completed';
        downloadStates[preset.id] = 'completed';
        try {
          fileSizeBytes = fs.statSync(filePath).size;
        } catch {}
      } else if (activeDownloads.has(preset.id)) {
        status = activeDownloads.get(preset.id)!.status;
      } else if (downloadStates[preset.id] === 'completed') {
        // GGUF was deleted manually — reset to idle
        downloadStates[preset.id] = 'idle';
        status = 'idle';
      } else if (downloadStates[preset.id]) {
        status = downloadStates[preset.id] === 'downloading' ? 'idle' : (downloadStates[preset.id] as any);
      }

      const activeProgress = activeDownloads.get(preset.id);

      return {
        ...preset,
        status,
        filePath: exists ? filePath : null,
        fileSizeBytes,
        progress: activeProgress || {
          modelId: preset.id,
          status,
          bytesDownloaded: exists ? fileSizeBytes : 0,
          totalBytes: exists ? fileSizeBytes : 0,
          progressPercentage: exists ? 100 : 0,
          speedMbps: 0
        }
      };
    });
  },

  getProgress(modelId: string): DownloadProgress {
    const active = activeDownloads.get(modelId);
    if (active) return active;

    const preset = MODEL_PRESETS.find(p => p.id === modelId);
    if (!preset) {
      return { modelId, status: 'failed', bytesDownloaded: 0, totalBytes: 0, progressPercentage: 0, speedMbps: 0, error: 'Model preset not found' };
    }

    const filePath = path.join(MODELS_DIR, preset.fileName);
    const exists = fs.existsSync(filePath);

    return {
      modelId,
      status: exists ? 'completed' : 'idle',
      bytesDownloaded: exists ? 100 : 0,
      totalBytes: exists ? 100 : 0,
      progressPercentage: exists ? 100 : 0,
      speedMbps: 0
    };
  },

  startDownload(modelId: string) {
    const preset = MODEL_PRESETS.find(p => p.id === modelId);
    if (!preset) {
      throw new Error(`Model preset '${modelId}' not found.`);
    }

    const filePath = path.join(MODELS_DIR, preset.fileName);
    if (fs.existsSync(filePath)) {
      return { status: 'completed', message: 'Model already downloaded.' };
    }

    if (activeDownloads.has(modelId) && activeDownloads.get(modelId)!.status === 'downloading') {
      return { status: 'downloading', message: 'Download is already in progress.' };
    }

    const progress: DownloadProgress = {
      modelId,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: 0,
      progressPercentage: 0,
      speedMbps: 0
    };

    activeDownloads.set(modelId, progress);
    downloadStates[modelId] = 'downloading';
    saveStates();

    this.downloadFile(preset.url, filePath, progress).then(() => {
      progress.status = 'completed';
      progress.progressPercentage = 100;
      activeDownloads.delete(modelId);
      downloadStates[modelId] = 'completed';
      saveStates();
      console.log(`[NYX] Successfully downloaded ${preset.name} → ${filePath}`);
    }).catch((err) => {
      progress.status = 'failed';
      progress.error = err.message || 'Download failed';
      activeDownloads.delete(modelId);
      downloadStates[modelId] = 'failed';
      saveStates();
      console.error(`[NYX] Failed to download ${preset.name}:`, err);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });

    return { status: 'downloading', message: 'Download started.' };
  },

  /**
   * Delete a downloaded GGUF model file from disk and reset its state to idle.
   * Returns true on success, throws on error.
   */
  deleteModel(modelId: string): { deleted: boolean; message: string } {
    const preset = MODEL_PRESETS.find(p => p.id === modelId);
    if (!preset) {
      throw new Error(`Model preset '${modelId}' not found.`);
    }

    // Cancel any active download for this model first
    if (activeDownloads.has(modelId)) {
      const prog = activeDownloads.get(modelId)!;
      prog.status = 'failed';
      prog.error = 'Deleted by user';
      activeDownloads.delete(modelId);
    }

    const filePath = path.join(MODELS_DIR, preset.fileName);
    const tmpPath = filePath + '.tmp';

    let deleted = false;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }

    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }

    downloadStates[modelId] = 'idle';
    saveStates();

    return { deleted, message: deleted ? `${preset.name} deleted from disk.` : 'No file found on disk, state reset.' };
  },

  downloadFile(url: string, destPath: string, progress: DownloadProgress): Promise<void> {
    return new Promise((resolve, reject) => {
      const tempPath = destPath + '.tmp';
      let fileStream = fs.createWriteStream(tempPath);
      let receivedBytes = 0;
      let totalBytes = 0;
      let lastTime = Date.now();
      let lastBytes = 0;

      const makeRequest = (currentUrl: string) => {
        const urlObj = new URL(currentUrl);
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
          }
        };

        const req = https.get(urlObj, options, (res: IncomingMessage) => {
          // Handle redirects (HuggingFace → AWS S3 / Cloudflare CDN)
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            let redirectUrl = res.headers.location;
            if (redirectUrl) {
              if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
                redirectUrl = new URL(redirectUrl, currentUrl).href;
              }
              fileStream.close();
              const newFileStream = fs.createWriteStream(tempPath);
              newFileStream.on('open', () => {
                fileStream.destroy();
                (fileStream as any) = newFileStream;
                makeRequest(redirectUrl!);
              });
              newFileStream.on('error', (err) => { reject(err); });
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Server responded with status code: ${res.statusCode}`));
            return;
          }

          totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          progress.totalBytes = totalBytes;

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            progress.bytesDownloaded = receivedBytes;

            if (totalBytes > 0) {
              progress.progressPercentage = Math.round((receivedBytes / totalBytes) * 100);
            }

            const now = Date.now();
            const elapsed = now - lastTime;
            if (elapsed >= 500) {
              const bytesDiff = receivedBytes - lastBytes;
              const speedBytesPerSec = (bytesDiff / elapsed) * 1000;
              progress.speedMbps = parseFloat((speedBytesPerSec / (1024 * 1024)).toFixed(2));
              lastTime = now;
              lastBytes = receivedBytes;
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              try {
                fs.renameSync(tempPath, destPath);
                resolve();
              } catch (e: any) {
                reject(e);
              }
            });
          });
        });

        req.on('error', (err) => {
          fileStream.close(() => {
            try { fs.unlinkSync(tempPath); } catch {}
            reject(err);
          });
        });

        req.setTimeout(600000, () => {
          req.destroy();
          fileStream.close(() => {
            try { fs.unlinkSync(tempPath); } catch {}
          });
          reject(new Error('Download timeout reached. Connection lost.'));
        });
      };

      makeRequest(url);
    });
  }
};
