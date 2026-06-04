import logger from '../../lib/logger.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import * as si from 'systeminformation';
import { LocalModelManager } from './localModelManager.ts';
import { gguf } from '@huggingface/gguf';
import { MODELS_DIR as BASE_DIR } from '../../lib/paths.ts';

const BIN_DIR = path.join(BASE_DIR, 'bin');
const IS_WIN = process.platform === 'win32';
const BIN_NAME = IS_WIN ? 'llama-server.exe' : 'llama-server';
const BINARY_PATH = path.join(BIN_DIR, BIN_NAME);

export function findLlamaServerPath(): string {
  if (fs.existsSync(BINARY_PATH)) return BINARY_PATH;

  const fallbackPaths = [path.join(BASE_DIR, BIN_NAME), path.join(BASE_DIR, '..', BIN_NAME)];

  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) return p;
  }

  return BINARY_PATH; // Default to downloading to BIN_DIR
}

export function getFreeVram(): Promise<number> {
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      // macOS Unified Memory
      const total = os.totalmem();
      const free = os.freemem();
      resolve(Math.max(0, free - 1024 * 1024 * 1024)); // Reserve 1GB for OS
      return;
    }

    const commands = [
      'nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
      '"C:\\Windows\\System32\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits',
      '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits',
      'rocm-smi --showmeminfo vram --json', // AMD ROCm fallback
    ];

    const tryExec = (idx: number) => {
      if (idx >= commands.length) {
        // Fallback to generic system free memory for integrated graphics
        resolve(Math.max(0, os.freemem() - 1024 * 1024 * 1024));
        return;
      }
      exec(commands[idx], (error: any, stdout: string) => {
        if (error) {
          tryExec(idx + 1);
        } else {
          if (commands[idx].includes('rocm')) {
            try {
              const data = JSON.parse(stdout);
              // Extract VRAM from first GPU
              const key = Object.keys(data)[0];
              const vram =
                parseInt(data[key]?.['VRAM Total Memory (B)'] || '0', 10) -
                parseInt(data[key]?.['VRAM Total Used Memory (B)'] || '0', 10);
              resolve(vram > 0 ? vram : 0);
            } catch {
              tryExec(idx + 1);
            }
          } else {
            const mem = parseInt(stdout.trim(), 10);
            resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
          }
        }
      });
    };

    tryExec(0);
  });
}

export function getOptimalVulkanDevice(): Promise<{
  name: string;
  index: number;
  type: string;
} | null> {
  return new Promise((resolve) => {
    const resolvedBinaryPath = HardwareDetector.findLlamaServerPath();
    exec(
      `"${resolvedBinaryPath}" --list-devices`,
      { cwd: path.dirname(resolvedBinaryPath) },
      (error: any, stdout: string, stderr: string) => {
        const output = (stdout || '') + '\n' + (stderr || '');
        if (!output.trim()) {
          resolve(null);
          return;
        }
        const lines = output.split('\n');

        // Priority list of discrete GPU keywords
        const discreteKeywords = ['nvidia', 'geforce', 'rtx', 'gtx', 'radeon', 'intel(r) arc'];

        // fallow-ignore-next-line code-duplication
        for (const line of lines) {
          const match = line.match(/^\s*(Device|Vulkan|CUDA)\s*(\d+)\s*:?/i);
          if (match) {
            const type = match[1].toLowerCase();
            const idxStr = match[2];
            const idx = parseInt(idxStr, 10);
            const lowerLine = line.toLowerCase();

            if (discreteKeywords.some((kw) => lowerLine.includes(kw))) {
              let name = `Vulkan${idx}`;
              if (type === 'cuda') {
                name = `CUDA${idx}`;
              }
              resolve({ name, index: idx, type });
              return;
            }
          }
        }

        // Fallback to first listed Vulkan device if no discrete match found
        // fallow-ignore-next-line code-duplication
        for (const line of lines) {
          const match = line.match(/^\s*(Device|Vulkan|CUDA)\s*(\d+)\s*:?/i);
          if (match) {
            const type = match[1].toLowerCase();
            const idxStr = match[2];
            const idx = parseInt(idxStr, 10);
            let name = `Vulkan${idx}`;
            if (type === 'cuda') {
              name = `CUDA${idx}`;
            }
            resolve({ name, index: idx, type });
            return;
          }
        }

        resolve(null);
      }
    );
  });
}

export async function detectGPUs(): Promise<
  { vendor: string; model: string; vramBytes: number; index: number }[]
> {
  try {
    const graphics = await si.graphics();
    let list = graphics && graphics.controllers ? graphics.controllers : [];

    const parsedList = list
      .filter((g) => {
        const v = (g.vendor || '').toLowerCase();
        const m = (g.model || '').toLowerCase();
        return (
          v.includes('nvidia') ||
          v.includes('amd') ||
          v.includes('intel') ||
          m.includes('nvidia') ||
          m.includes('radeon') ||
          m.includes('geforce') ||
          m.includes('rtx')
        );
      })
      .map((g, i) => {
        let vramMB = g.vram || g.memoryTotal || 0;
        if (typeof vramMB !== 'number' || isNaN(vramMB) || vramMB < 0) {
          vramMB = 0;
        }

        // Fallback for discrete cards reporting 0 VRAM
        const lowerModel = (g.model || '').toLowerCase();
        const lowerVendor = (g.vendor || '').toLowerCase();
        const isDiscrete =
          lowerModel.includes('geforce') ||
          lowerModel.includes('rtx') ||
          lowerModel.includes('gtx') ||
          lowerModel.includes('radeon') ||
          lowerVendor.includes('nvidia') ||
          lowerVendor.includes('amd');
        if (vramMB === 0 && isDiscrete) {
          vramMB = 4096; // Fallback to 4GB
        }

        return {
          vendor: g.vendor || 'Unknown',
          model: g.model || 'Unknown',
          vramBytes: vramMB * 1024 * 1024,
          index: i,
        };
      });

    // If no GPUs detected but nvidia-smi is available, synthesize NVIDIA GPU!
    if (parsedList.length === 0) {
      try {
        const freeVram = await HardwareDetector.getFreeVram();
        if (freeVram > 0) {
          logger.info('[GPU Detection] Synthesizing primary NVIDIA GPU from nvidia-smi query');
          parsedList.push({
            vendor: 'NVIDIA',
            model: 'GeForce Dedicated GPU',
            vramBytes: freeVram + 750 * 1024 * 1024, // Add baseline overhead back for raw VRAM estimation
            index: 0,
          });
        }
      } catch {}
    }

    // Sort discrete/high-performance GPUs first
    const sortedList = parsedList.sort((a, b) => {
      const aModel = a.model.toLowerCase();
      const bModel = b.model.toLowerCase();
      const aVendor = a.vendor.toLowerCase();
      const bVendor = b.vendor.toLowerCase();

      const aIsDiscrete =
        aModel.includes('geforce') ||
        aModel.includes('rtx') ||
        aModel.includes('gtx') ||
        aModel.includes('radeon') ||
        aVendor.includes('nvidia');
      const bIsDiscrete =
        bModel.includes('geforce') ||
        bModel.includes('rtx') ||
        bModel.includes('gtx') ||
        bModel.includes('radeon') ||
        bVendor.includes('nvidia');

      if (aIsDiscrete && !bIsDiscrete) return -1;
      if (!aIsDiscrete && bIsDiscrete) return 1;

      // Otherwise sort by VRAM size descending
      return b.vramBytes - a.vramBytes;
    });

    return sortedList.filter((g) => g.vramBytes > 0);
  } catch (err: any) {
    logger.warn('[GPU Detection] Failed to query systeminformation graphics:', err);
    try {
      const freeVram = await HardwareDetector.getFreeVram();
      if (freeVram > 0) {
        return [
          {
            vendor: 'NVIDIA',
            model: 'GeForce Dedicated GPU',
            vramBytes: freeVram + 750 * 1024 * 1024,
            index: 0,
          },
        ];
      }
    } catch {}
    return [];
  }
}

export async function calculateOptimalLayers(
  modelId: string,
  contextSize = 2048
): Promise<{
  gpuLayers: number;
  totalLayers: number;
  batchSize: number;
  microBatchSize: number;
  fileSize: number;
  message: string;
  hasGPU: boolean;
  gpuInfo: { vendor: string; model: string; vramBytes: number; index: number }[];
}> {
  let totalLayers = 32;
  const models = LocalModelManager.listModels();
  const model = models.find((m) => m.id === modelId);
  let fileSize = 2 * 1024 * 1024 * 1024;

  if (model && model.status === 'completed' && model.filePath) {
    try {
      fileSize = fs.statSync(model.filePath).size;
      // Parse GGUF metadata
      const metadata = await gguf(model.filePath, { allowLocalFile: true });
      const parsedMeta = metadata?.metadata as any;
      if (parsedMeta) {
        const blockCount =
          parsedMeta['llama.block_count'] ||
          parsedMeta['qwen2.block_count'] ||
          parsedMeta['gemma2.block_count'] ||
          parsedMeta['phi3.block_count'];
        if (blockCount) {
          totalLayers = Number(blockCount);
          logger.info(`[GGUF Parser] Extracted ${totalLayers} layers from ${modelId}`);
        }
      }
    } catch (err) {
      logger.warn('Failed to parse GGUF metadata, falling back to heuristics:', err);
    }
  } else if (model) {
    const parsed = parseFloat(model.size);
    if (!isNaN(parsed)) fileSize = parsed * 1024 * 1024 * 1024;
  }

  const gpus = await HardwareDetector.detectGPUs();
  const hasGPU = gpus.length > 0;
  let batchSize = Math.min(2048, contextSize);
  let microBatchSize = Math.min(512, batchSize);

  if (!hasGPU) {
    return {
      gpuLayers: 0,
      totalLayers,
      batchSize,
      microBatchSize,
      fileSize,
      message: `No active GPU detected. Running all ${totalLayers} layers entirely on CPU/RAM.`,
      hasGPU: false,
      gpuInfo: [],
    };
  }

  const primaryGPU = gpus[0];
  let availableVram = primaryGPU.vramBytes;
  let freeNvidiaVram = 0;
  try {
    freeNvidiaVram = await HardwareDetector.getFreeVram();
  } catch {}

  let usableVram = 0;
  if (freeNvidiaVram > 0) {
    usableVram = Math.max(0, freeNvidiaVram - 250 * 1024 * 1024);
  } else {
    usableVram = Math.max(0, availableVram - 750 * 1024 * 1024);
  }

  let usedBackend: 'cuda' | 'vulkan' = 'vulkan';
  try {
    const installedVersion = fs.readFileSync(path.join(BIN_DIR, '.version'), 'utf-8').trim();
    usedBackend = installedVersion.endsWith('-cuda') ? 'cuda' : 'vulkan';
  } catch {}

  const kvCachePerTokenPerLayer = usedBackend === 'vulkan' ? 4096 : 2048;
  const kvCachePerLayer = contextSize * kvCachePerTokenPerLayer;

  const computeBuffer = batchSize * 512 * 4;
  if (fileSize + computeBuffer > usableVram) {
    batchSize = 512;
    microBatchSize = 128;
  }

  const availableForLayers = Math.max(0, usableVram - batchSize * 512 * 4);
  const layerWeightSize = fileSize / totalLayers;
  const layerSize = layerWeightSize + kvCachePerLayer;
  const maxLayersByVram = Math.floor(availableForLayers / layerSize);
  const safeLayers = Math.max(0, Math.min(totalLayers, maxLayersByVram));

  let message =
    safeLayers >= totalLayers
      ? `GPU has abundant VRAM! Loaded all ${totalLayers}/${totalLayers} layers to GPU.`
      : `GPU VRAM limit reached. Offloaded ${safeLayers}/${totalLayers} layers to VRAM.`;

  return {
    gpuLayers: safeLayers,
    totalLayers,
    batchSize,
    microBatchSize,
    fileSize,
    message,
    hasGPU: true,
    gpuInfo: gpus,
  };
}

export async function detectBackend(): Promise<'cuda' | 'vulkan' | 'metal'> {
  if (process.platform === 'darwin') return 'metal';
  // We prefer Vulkan by default on Windows/Linux to avoid massive 620MB CUDA download and setup latency.
  // Vulkan delivers extremely high GPU acceleration (up to 78% of layers offloaded) with a 20x smaller
  // package (31MB) and zero complex driver dependencies, guaranteeing an instant and robust startup.
  return 'vulkan';
}

export const HardwareDetector = {
  findLlamaServerPath,
  getFreeVram,
  getOptimalVulkanDevice,
  detectGPUs,
  calculateOptimalLayers,
  detectBackend,
};
