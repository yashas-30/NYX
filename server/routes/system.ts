import { Router } from 'express';
import os from 'os';
import { exec } from 'child_process';
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
    vram = await new Promise((resolve) => {
      const commands = [
        'nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits',
        '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.total --format=csv,noheader,nounits'
      ];
      const tryExec = (idx: number) => {
        if (idx >= commands.length) {
          resolve(0);
          return;
        }
        exec(commands[idx], (error: any, stdout: string) => {
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
      const commands = [
        'nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
        '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits'
      ];
      const tryExec = (idx: number) => {
        if (idx >= commands.length) {
          resolve(0);
          return;
        }
        exec(commands[idx], (error: any, stdout: string) => {
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
