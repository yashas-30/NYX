import os from 'os';
import { exec, execFile } from 'child_process';
import checkDiskSpace from 'check-disk-space';
import si from 'systeminformation';
import { APP_STATE_DIR } from '../../lib/paths.js';
import { CacheServer } from '../../lib/cache.js';
import logger from '../../lib/logger.js';
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { loadKeys } from '../vault/vault.service.js';

interface VRAMResult {
  vram: number;
  freeVram: number;
  gpuName: string;
}

export class SystemService {
  private execNvidiaSmi(): Promise<VRAMResult | null> {
    const executables = [
      'nvidia-smi',
      'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
    ];
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

  private execRocmSmi(): Promise<VRAMResult | null> {
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
              gpuName: 'AMD Radeon GPU (ROCm)',
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

  private async getSystemInfoGraphics(): Promise<VRAMResult> {
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
        gpuName: gpuNames.join(', ') || 'Generic GPU',
      };
    } catch {
      return { vram: 0, freeVram: 0, gpuName: 'Generic GPU' };
    }
  }

  async detectVRAM(): Promise<VRAMResult> {
    const nvidia = await this.execNvidiaSmi();
    if (nvidia) return nvidia;

    const amd = await this.execRocmSmi();
    if (amd) return amd;

    return await this.getSystemInfoGraphics();
  }

  async getHealth() {
    const checks = {
      server: 'ok',
      timestamp: Date.now(),
      dependencies: {} as Record<string, 'ok' | 'degraded' | 'down'>,
    };

    // 1. Check llama-server health
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const llamaPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;
      const r = await fetch(`http://127.0.0.1:${llamaPort}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      checks.dependencies.llamaServer = r.ok ? 'ok' : 'degraded';
    } catch (error: any) {
      checks.dependencies.llamaServer = 'down';
    }

    // 1.5 Check Database health
    try {
      await db.get(sql`SELECT 1`);
      checks.dependencies.database = 'ok';
    } catch (error: any) {
      checks.dependencies.database = 'down';
    }

    // 2. Check docker health
    try {
      await new Promise<void>((resolve, reject) => {
        exec('docker ps', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      checks.dependencies.docker = 'ok';
    } catch (error: any) {
      checks.dependencies.docker = 'down';
    }

    // 3. Check disk space health
    try {
      const disk = await (checkDiskSpace as any)(APP_STATE_DIR);
      // Degraded if less than 1GB free
      checks.dependencies.disk = disk.free > 1 * 1024 * 1024 * 1024 ? 'ok' : 'degraded';
    } catch (error: any) {
      checks.dependencies.disk = 'down';
    }

    // 4. Check AI Providers health (Gemini / OpenRouter etc.)
    try {
      const keys = await loadKeys();
      const hasGemini = !!(keys.gemini && typeof keys.gemini === 'string' && keys.gemini.trim().length > 0) || !!(env.GEMINI_API_KEY && typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim().length > 0);
      checks.dependencies.aiProviders = hasGemini ? 'ok' : 'degraded';
    } catch (error: any) {
      checks.dependencies.aiProviders = 'down';
    }

    const overall = Object.values(checks.dependencies).every((s) => s === 'ok')
      ? 'ok'
      : Object.values(checks.dependencies).some((s) => s === 'down')
        ? 'degraded'
        : 'ok';

    return { overall, checks };
  }

  async getMetrics() {
    const cacheStats = await CacheServer.getStats();
    const total = cacheStats.hits + cacheStats.misses;
    const hitRate = total > 0 ? cacheStats.hits / total : 0;
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    return {
      cacheStats,
      hitRate,
      uptime,
      memory,
    };
  }

  async getSystemSpecs(modelId?: string) {
    const { vram, freeVram, gpuName } = await this.detectVRAM();

    let optimalLayers = null;

    return {
      platform: os.platform(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      vram,
      freeVram,
      gpuName,
      optimalLayers,
    };
  }
}
