import { Router } from 'express';
import os from 'os';
import { execFile } from 'child_process';
import { LocalModelRunner } from '../lib/localModelRunner.ts';
import si from 'systeminformation';
import logger from '../lib/logger.ts';

export const systemRouter = Router();

interface VRAMResult {
  vram: number;
  freeVram: number;
  gpuName: string;
}

function execNvidiaSmi(): Promise<VRAMResult | null> {
  const executables = ['nvidia-smi', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'];
  const args = ['--query-gpu=memory.total,memory.free,gpu_name', '--format=csv,noheader,nounits'];
  
  return new Promise((resolve) => {
    const tryExec = (idx: number) => {
      if (idx >= executables.length) {
        resolve(null);
        return;
      }
      execFile(executables[idx], args, (error, stdout) => {
        if (error || !stdout) {
          tryExec(idx + 1);
        } else {
          const parts = stdout.trim().split(',');
          if (parts.length >= 3) {
            const totalMiB = parseInt(parts[0].trim(), 10);
            const freeMiB = parseInt(parts[1].trim(), 10);
            const gpuName = parts.slice(2).join(',').trim();
            const vram = isNaN(totalMiB) ? 0 : totalMiB * 1024 * 1024;
            const freeVram = isNaN(freeMiB) ? 0 : freeMiB * 1024 * 1024;
            resolve({ vram, freeVram, gpuName });
          } else {
            tryExec(idx + 1);
          }
        }
      });
    };
    tryExec(0);
  });
}

function execRocmSmi(): Promise<VRAMResult | null> {
  return new Promise((resolve) => {
    execFile('rocm-smi', ['--showmeminfo', 'vram', '--json'], (error, stdout) => {
      if (error || !stdout) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        let totalBytes = 0;
        let usedBytes = 0;
        for (const cardKey in parsed) {
          const card = parsed[cardKey];
          for (const k in card) {
            const lowerK = k.toLowerCase();
            if (lowerK.includes('vram') && lowerK.includes('total')) {
              totalBytes = parseInt(card[k], 10) || totalBytes;
            }
            if (lowerK.includes('vram') && lowerK.includes('used')) {
              usedBytes = parseInt(card[k], 10) || usedBytes;
            }
          }
        }
        if (totalBytes > 0) {
          const freeBytes = Math.max(0, totalBytes - usedBytes);
          resolve({
            vram: totalBytes,
            freeVram: freeBytes,
            gpuName: 'AMD Radeon GPU (ROCm)'
          });
          return;
        }
      } catch {
        // ignore json parse errors
      }
      resolve(null);
    });
  });
}

async function getSystemInfoGraphics(): Promise<VRAMResult> {
  try {
    const graphics = await si.graphics();
    let totalVramBytes = 0;
    const gpuNames: string[] = [];
    if (graphics && Array.isArray(graphics.controllers)) {
      for (const controller of graphics.controllers) {
        const mem = controller.vram || 0; // in MB
        if (mem > 0) {
          totalVramBytes += mem * 1024 * 1024;
        }
        if (controller.model) {
          gpuNames.push(controller.model);
        }
      }
    }
    return {
      vram: totalVramBytes,
      freeVram: Math.round(totalVramBytes * 0.8), // defensive fallback estimate
      gpuName: gpuNames.join(', ') || 'Generic GPU'
    };
  } catch {
    return { vram: 0, freeVram: 0, gpuName: 'Generic GPU' };
  }
}

async function detectVRAM(): Promise<VRAMResult> {
  const nvidia = await execNvidiaSmi();
  if (nvidia) return nvidia;

  const amd = await execRocmSmi();
  if (amd) return amd;

  return await getSystemInfoGraphics();
}

// System Specs
systemRouter.get('/system', async (req, res) => {
  const modelId = req.query.modelId as string;
  
  const { vram, freeVram, gpuName } = await detectVRAM();

  let optimalLayers = null;
  if (modelId) {
    try {
      optimalLayers = await LocalModelRunner.calculateOptimalLayers(modelId);
    } catch (err: any) {
      logger.error({ err }, 'Error calculating optimal layers on /api/system');
    }
  }

  res.json({
    platform: os.platform(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    cpus: os.cpus().length,
    vram,
    freeVram,
    gpuName,
    optimalLayers
  });
});
