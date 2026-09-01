/**
 * @file src/core/agents/antigravity/triggers.ts
 * @description Background Trigger Scheduler for Antigravity SDK.
 */

import { Trigger } from './types';

export function every(intervalSeconds: number, callback: (ctx: any) => Promise<void>): Trigger {
  return {
    intervalSeconds,
    callback,
  };
}

export class TriggerRunner {
  private timerIds: any[] = [];
  private isRunning: boolean = false;

  constructor(
    private triggers: Trigger[] = [],
    private contextProvider: () => any
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const trigger of this.triggers) {
      const intervalMs = Math.max(1000, trigger.intervalSeconds * 1000);
      const timer = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          const ctx = this.contextProvider();
          if (ctx) {
            await trigger.callback(ctx);
          }
        } catch (err) {
          console.warn('[Antigravity:TriggerRunner] Trigger error:', err);
        }
      }, intervalMs);
      this.timerIds.push(timer);
    }
  }

  public stop(): void {
    this.isRunning = false;
    for (const id of this.timerIds) {
      clearInterval(id);
    }
    this.timerIds = [];
  }
}
