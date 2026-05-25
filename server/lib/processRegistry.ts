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
  console.log(`[ProcessRegistry] Cleaning up ${activeProcesses.size} active child processes...`);
  for (const proc of activeProcesses) {
    if (proc.pid) {
      try {
        kill(proc.pid, 'SIGKILL', (err) => {
          if (err) {
            console.error(`[ProcessRegistry] Failed to tree-kill process ${proc.pid}:`, err.message);
          }
        });
      } catch (err: any) {
        console.error(`[ProcessRegistry] Exception tree-killing process ${proc.pid}:`, err.message);
      }
    }
  }
  activeProcesses.clear();
}
