import logger from './logger.js';
import { ChildProcess } from 'child_process';
import kill from 'tree-kill';

const activeProcesses = new Set<ChildProcess>();

export function registerProcess(proc: ChildProcess): void {
  activeProcesses.add(proc);
  proc.on('exit', () => {
    activeProcesses.delete(proc);
  });
}

export function cleanupProcesses(): void {
  if (activeProcesses.size === 0) return;
  logger.info(`[ProcessRegistry] Cleaning up ${activeProcesses.size} active child processes...`);
  for (const proc of activeProcesses) {
    if (proc.pid) {
      try {
        kill(proc.pid, 'SIGKILL', (err) => {
          if (err) {
            logger.error({ err }, `[ProcessRegistry] Failed to tree-kill process ${proc.pid}`);
          }
        });
      } catch (error: any) {
        logger.error(
          { err: error },
          `[ProcessRegistry] Exception tree-killing process ${proc.pid}`
        );
      }
    }
  }
  activeProcesses.clear();
}
