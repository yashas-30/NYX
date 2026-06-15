import { EventEmitter } from 'events';
import logger from '../logger.js';

export interface AgentTaskPayload {
  prompt: string;
  provider: string;
  model: string;
  apiKey: string;
  context?: string; // Optional extra context for coder/optimizer
}

export interface AgentTask {
  id: string;
  type: 'planner' | 'coder' | 'optimizer' | 'full_pipeline' | 'code_review';
  payload: AgentTaskPayload;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
}

/**
 * In-memory Task Queue to handle long-running agent tasks without
 * blocking the Fastify event loop, ensuring background execution
 * parity with cloud agent platforms.
 */
class AgentTaskQueue extends EventEmitter {
  private queue: AgentTask[] = [];
  private activeTasks = new Map<string, AgentTask>();
  private isProcessing = false;

  enqueue(task: Omit<AgentTask, 'status' | 'createdAt'>): string {
    const fullTask: AgentTask = {
      ...task,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.queue.push(fullTask);
    logger.info(`[TaskQueue] Enqueued task ${task.id} (${task.type})`);
    
    // Fire event to notify WebSocket clients
    this.emit('task_queued', fullTask);
    
    this.processNext();
    return task.id;
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue.shift();
    if (!task) {
      this.isProcessing = false;
      return;
    }

    task.status = 'running';
    this.activeTasks.set(task.id, task);
    this.emit('task_started', task);
    logger.info(`[TaskQueue] Started task ${task.id}`);

    try {
      // Pass execution to SubagentOrchestrator
      const { SubagentOrchestrator } = await import('./SubagentOrchestrator.js');
      await SubagentOrchestrator.execute(task);
      
      task.status = 'completed';
      this.emit('task_completed', task);
      logger.info(`[TaskQueue] Completed task ${task.id}`);
    } catch (err) {
      task.status = 'failed';
      this.emit('task_failed', { task, error: err });
      logger.error(`[TaskQueue] Failed task ${task.id}`, err);
    } finally {
      this.activeTasks.delete(task.id);
      this.isProcessing = false;
      this.processNext(); // Process next in queue
    }
  }

  getTaskStatus(id: string): AgentTask | undefined {
    return this.activeTasks.get(id) || this.queue.find(t => t.id === id);
  }
}

export const taskQueue = new AgentTaskQueue();
