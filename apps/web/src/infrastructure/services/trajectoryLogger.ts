import { invoke } from '@tauri-apps/api/core';
import { ToolCall, ToolResult } from '@src/features/agents/agentLoop';

export interface TrajectoryLogEntry {
  timestamp: number;
  prompt: string;
  action: ToolCall | null;
  observation: ToolResult | string | null;
  reward?: number;
  success?: boolean;
}

export class TrajectoryLogger {
  private static instance: TrajectoryLogger;
  
  private constructor() {}

  public static getInstance(): TrajectoryLogger {
    if (!this.instance) {
      this.instance = new TrajectoryLogger();
    }
    return this.instance;
  }

  public async logInteraction(entry: TrajectoryLogEntry): Promise<void> {
    try {
      const logLine = JSON.stringify(entry);
      console.log('[TRAJECTORY_LOG]', logLine);
      
      try {
        await invoke('fs_append_file', {
          path: '.nyx-logs/trajectories.jsonl',
          content: logLine + '\n'
        });
      } catch (err) {
        console.debug('Failed to write trajectory to fs:', err);
      }
    } catch (e) {
      console.error('Failed to log trajectory', e);
    }
  }
}
