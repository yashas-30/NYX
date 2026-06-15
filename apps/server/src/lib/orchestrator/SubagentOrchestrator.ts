import logger from '../logger.js';
import { AgentTask, taskQueue } from './TaskQueue.js';
import {
  PLANNER_SYSTEM_PROMPT,
  CODER_SYSTEM_PROMPT,
  OPTIMIZER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
} from './agentPrompts.js';

/**
 * Server-side Subagent Orchestrator.
 * Manages the Planner → Coder → Optimizer loop directly on the backend.
 * Every stage calls a real LLM via UnifiedEngine — no stubs.
 */
export class SubagentOrchestrator {

  static async execute(task: AgentTask) {
    logger.info(`[SubagentOrchestrator] Beginning execution for task ${task.id} (${task.type})`);

    try {
      switch (task.type) {
        case 'full_pipeline':
          await this.runFullPipeline(task);
          break;
        case 'code_review':
          await this.runCodeReview(task);
          break;
        default:
          await this.runSingleAgent(task);
      }
    } catch (err) {
      logger.error(`[SubagentOrchestrator] Task ${task.id} failed:`, err);
      throw err;
    }
  }

  // ── Full Pipeline: Planner → Coder → Optimizer ──────────────────────────────

  private static async runFullPipeline(task: AgentTask) {
    const { prompt, provider, model, apiKey } = task.payload;

    // Stage 1: Planner
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Planner', status: 'thinking' });
    const plan = await this.invokePlanner(prompt, provider, model, apiKey);
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Planner', status: 'done', result: plan });

    // Stage 2: Coder — receives the plan
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Coder', status: 'coding', plan });
    const planWithContext = `Implementation Plan:\n${plan}\n\nUser's Original Request:\n${prompt}`;
    const code = await this.invokeCoder(planWithContext, provider, model, apiKey);
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Coder', status: 'done', result: code });

    // Stage 3: Optimizer — receives the code
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Optimizer', status: 'refining' });
    const finalResult = await this.invokeOptimizer(code, provider, model, apiKey);
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Optimizer', status: 'done', result: finalResult });
  }

  // ── Code Review Pipeline ─────────────────────────────────────────────────────

  private static async runCodeReview(task: AgentTask) {
    const { prompt, context, provider, model, apiKey } = task.payload;
    const reviewInput = context
      ? `Original Requirements:\n${prompt}\n\nCode to Review:\n${context}`
      : prompt;

    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Reviewer', status: 'reviewing' });
    const reviewJson = await this.invokeAgent(
      REVIEWER_SYSTEM_PROMPT,
      reviewInput,
      provider,
      model,
      apiKey
    );
    taskQueue.emit('agent_status', { taskId: task.id, agent: 'Reviewer', status: 'done', result: reviewJson });
  }

  // ── Single Agent ─────────────────────────────────────────────────────────────

  private static async runSingleAgent(task: AgentTask) {
    const { type, payload } = task;
    const { prompt, provider, model, apiKey } = payload;

    const systemPromptMap: Record<string, string> = {
      planner:   PLANNER_SYSTEM_PROMPT,
      coder:     CODER_SYSTEM_PROMPT,
      optimizer: OPTIMIZER_SYSTEM_PROMPT,
    };

    const systemPrompt = systemPromptMap[type] || PLANNER_SYSTEM_PROMPT;
    taskQueue.emit('agent_status', { taskId: task.id, agent: type, status: 'running' });
    const result = await this.invokeAgent(systemPrompt, prompt, provider, model, apiKey);
    taskQueue.emit('agent_status', { taskId: task.id, agent: type, status: 'done', result });
  }

  // ── Agent Invocations ────────────────────────────────────────────────────────

  /**
   * Core helper: streams a UnifiedEngine response and collects it into a string.
   */
  static async invokeAgent(
    systemPrompt: string,
    userContent: string,
    provider: string,
    model: string,
    apiKey: string
  ): Promise<string> {
    // Lazy-import to avoid circular dependencies
    const { UnifiedEngine } = await import('../../lib/unifiedEngine.js');

    return new Promise<string>((resolve, reject) => {
      let output = '';

      UnifiedEngine.executeStream(
        {
          provider: provider as any,
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          apiKey,
          settings: { temperature: 0.2, maxTokens: 8192 },
        },
        (chunk: any) => {
          const text = chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '';
          if (typeof text === 'string') output += text;
        },
        () => resolve(output)
      ).catch(reject);
    });
  }

  private static async invokePlanner(
    prompt: string,
    provider: string,
    model: string,
    apiKey: string
  ): Promise<string> {
    return this.invokeAgent(PLANNER_SYSTEM_PROMPT, prompt, provider, model, apiKey);
  }

  private static async invokeCoder(
    plan: string,
    provider: string,
    model: string,
    apiKey: string
  ): Promise<string> {
    return this.invokeAgent(CODER_SYSTEM_PROMPT, plan, provider, model, apiKey);
  }

  private static async invokeOptimizer(
    code: string,
    provider: string,
    model: string,
    apiKey: string
  ): Promise<string> {
    return this.invokeAgent(OPTIMIZER_SYSTEM_PROMPT, code, provider, model, apiKey);
  }
}
