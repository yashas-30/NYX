import { Router } from 'express';
import os from 'os';
import { execFile } from 'child_process';
import { LocalModelRunner } from '../lib/localModelRunner.ts';

export const systemRouter = Router();

// Health check
systemRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));

// System Specs
systemRouter.get('/system', async (req, res) => {
  const modelId = req.query.modelId as string;
  
  let vram = 0;
  let freeVram = 0;
  try {
    const argsTotal = ['--query-gpu=memory.total', '--format=csv,noheader,nounits'];
    const argsFree = ['--query-gpu=memory.free', '--format=csv,noheader,nounits'];

    vram = await new Promise((resolve) => {
      const executables = ['nvidia-smi', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'];
      const tryExec = (idx: number) => {
        if (idx >= executables.length) {
          resolve(0);
          return;
        }
        execFile(executables[idx], argsTotal, (error, stdout) => {
          if (error) {
            tryExec(idx + 1);
          } else {
            const mem = parseInt(stdout.trim(), 10);
            resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
          }
        });
      };
      tryExec(0);
    });

    freeVram = await new Promise((resolve) => {
      const executables = ['nvidia-smi', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'];
      const tryExec = (idx: number) => {
        if (idx >= executables.length) {
          resolve(0);
          return;
        }
        execFile(executables[idx], argsFree, (error, stdout) => {
          if (error) {
            tryExec(idx + 1);
          } else {
            const mem = parseInt(stdout.trim(), 10);
            resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
          }
        });
      };
      tryExec(0);
    });
  } catch {
    vram = 0;
    freeVram = 0;
  }

  let optimalLayers = null;
  if (modelId) {
    try {
      optimalLayers = await LocalModelRunner.calculateOptimalLayers(modelId);
    } catch (err: any) {
      console.error('Error calculating optimal layers on /api/system:', err.message);
    }
  }

  res.json({
    platform: os.platform(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    cpus: os.cpus().length,
    vram,
    freeVram,
    optimalLayers
  });
});
