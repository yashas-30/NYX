/**
 * @file src/features/coder/hooks/useSubagentOrchestrator.ts
 * @description Claude Code-style subagent swarm orchestrator.
 * Decomposes complex tasks, manages parallel subagent execution, runs tool-use loops,
 * and performs self-correction compilation checks.
 */

import { useRef } from 'react';
import { AIService, countTokens } from '@src/core/services/ai.service';
import { ContinuationManager } from '@src/infrastructure/services/continuationManager';
import { HybridModelRouter } from '@src/infrastructure/services/hybridRouter';
import { WorkspaceIntelligence } from '@src/infrastructure/services/workspaceIntelligence';
import { TOOL_REGISTRY, ToolExecutor } from '@src/infrastructure/services/toolSystem';
import { SUBAGENT_PERSONAS } from '@src/features/coder/config/agents';
import { validateWorkspace, searchCodebase, searchWeb } from '../api/coderApi';
import {
  SubagentTask,
  SubagentResult,
  SubagentPlan,
  OrchestratorOptions,
  ChatMessage,
  TelemetryMetrics,
} from '@src/infrastructure/types';

const FALLBACK_ROUTING_DECISION = {
  modelId: 'pollinations/openai-fast',
  provider: 'pollinations' as const,
  reasoning: 'Failed before routing',
  estimatedLatency: 0,
  estimatedCost: 'free' as const,
};

export class SubagentOrchestrator {
  private tasks = new Map<string, SubagentTask>();
  private results = new Map<string, SubagentResult>();
  private controller: AbortController | null = null;
  onTaskUpdate?: (tasks: SubagentTask[]) => void;

  async execute(prompt: string, options: OrchestratorOptions): Promise<SubagentResult[]> {
    this.controller = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => this.controller?.abort());
    }
    this.tasks.clear();
    this.results.clear();

    try {
      const plan = await this.runPlanner(prompt, options);
      this.buildTaskMap(plan);
      await this.executeGraph(prompt, options);
      return Array.from(this.results.values());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg !== 'AbortError') {
        console.error('[SubagentOrchestrator] Swarm execution failed:', msg);
      }
      throw error;
    } finally {
      // BAD-3: Clear Maps after every execution cycle to prevent memory leaks
      this.tasks.clear();
      this.results.clear();
    }
  }

  abort(): void {
    this.controller?.abort();
  }

  // ── Planner ────────────────────────────────────────────────────────────────

  private async runPlanner(prompt: string, options: OrchestratorOptions): Promise<SubagentPlan> {
    const decision = await HybridModelRouter.selectPlannerModel(
      options.apiKeys,
      AIService.checkStatus.bind(AIService)
    );
    const systemInstruction = SUBAGENT_PERSONAS.planner;

    const profile = await WorkspaceIntelligence.getProfile();
    const profileText = `\n\n[WORKSPACE PROFILE]\n${JSON.stringify(profile, null, 2)}\n[END PROFILE]`;

    const result = await ContinuationManager.executeWithContinuation(
      AIService.execute.bind(AIService),
      decision.modelId,
      decision.provider,
      `Task: ${prompt}${profileText}\n\nDecompose this into subtasks. Output ONLY JSON.`,
      options.apiKeys[decision.provider],
      systemInstruction,
      { temperature: 0.1, maxTokens: 2048 },
      undefined,
      this.controller?.signal,
      undefined
    );

    try {
      const cleaned = result.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      const parsed = JSON.parse(cleaned) as SubagentPlan;
      if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
        throw new Error('Invalid plan structure');
      }
      return parsed;
    } catch (err) {
      console.warn('[SubagentOrchestrator] Planner failed, creating single task fallback:', err);
      return {
        subtasks: [
          {
            id: '1',
            type: 'coder',
            description: 'Execute the user request completely',
            complexity: 'moderate',
            requiresCloud: false,
            dependencies: [],
          },
        ],
      };
    }
  }

  // ── Dependency Graph Builder ───────────────────────────────────────────────

  private buildTaskMap(plan: SubagentPlan): void {
    for (const st of plan.subtasks) {
      const task: SubagentTask = {
        ...st,
        status: 'queued',
      };
      this.tasks.set(task.id, task);
    }
    this.emitUpdate();
  }

  // ── Parallel Execution Graph ───────────────────────────────────────────────

  private async executeGraph(originalPrompt: string, options: OrchestratorOptions): Promise<void> {
    const completed = new Set<string>();
    const inFlight = new Map<string, Promise<void>>();

    while (completed.size < this.tasks.size) {
      const ready = Array.from(this.tasks.values()).filter(
        (t) =>
          !completed.has(t.id) &&
          !inFlight.has(t.id) &&
          t.dependencies.every((d) => completed.has(d))
      );

      if (ready.length === 0 && inFlight.size === 0) {
        throw new Error('Deadlock detected in dependency graph');
      }

      const finalTaskId = this.identifyFinalTask();

      for (const task of ready) {
        const isFinalOutput = task.id === finalTaskId;
        const promise = this.runSubagent(task, originalPrompt, options, isFinalOutput)
          .then(() => {
            completed.add(task.id);
            inFlight.delete(task.id);
          })
          .catch((err: unknown) => {
            completed.add(task.id);
            inFlight.delete(task.id);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === 'AbortError') throw err;
          });
        inFlight.set(task.id, promise);
      }

      if (inFlight.size > 0) {
        await Promise.race(inFlight.values());
      }
    }
  }

  private identifyFinalTask(): string {
    const all = Array.from(this.tasks.values());
    const dependents = new Set<string>();
    for (const t of all) {
      for (const d of t.dependencies) {
        dependents.add(d);
      }
    }
    const leaves = all.filter((t) => !dependents.has(t.id));
    if (leaves.length === 1) return leaves[0].id;

    const coderLeaf = leaves.find((l) => l.type === 'coder' || l.type === 'optimizer');
    return coderLeaf?.id ?? leaves[0]?.id ?? all[all.length - 1].id;
  }

  // ── Subagent Tool Execution Loop & Run ──────────────────────────────────────

  private async runSubagent(
    task: SubagentTask,
    originalPrompt: string,
    options: OrchestratorOptions,
    isFinalOutput: boolean
  ): Promise<void> {
    task.status = 'running';
    this.emitUpdate();

    try {
      const routing = await HybridModelRouter.routeSubagent(
        task,
        options.apiKeys,
        AIService.checkStatus.bind(AIService)
      );
      task.assignedModel = routing;

      const handoff = await this.buildHandoffSpec(task, originalPrompt, options);
      const persona = SUBAGENT_PERSONAS[task.type];

      const startTime = Date.now();

      // Tool System inclusion for Planner/Coder/Optimizer types
      const toolsPrompt = `
[AVAILABLE TOOLS]
${JSON.stringify(TOOL_REGISTRY, null, 2)}

You can execute actions/tools by outputting a JSON markdown block strictly matching the schema:
\`\`\`json
{
  "tool": "read_file" | "edit_file" | "write_file" | "search_codebase" | "run_terminal" | "web_search" | "list_directory" | "git_diff" | "git_status",
  "params": { ...parameters... }
}
\`\`\`
If you invoke a tool, the system will execute it and return the stdout/output to you. You can call multiple tools sequentially before making your final response.`;

      const systemPrompt = `${persona}\n\n${toolsPrompt}`;

      const messages: ChatMessage[] = [{ role: 'user', content: handoff, timestamp: Date.now() }];

      let loopCount = 0;
      const maxLoops = 8;
      let finalText = '';
      let finalMetrics: TelemetryMetrics = { latency: 0, tokens: 0, tps: 0 };

      while (loopCount < maxLoops) {
        loopCount++;

        if (this.controller?.signal.aborted) {
          throw new Error('AbortError');
        }

        const promptPayload = messages[messages.length - 1].content;

        // Execute through fallback chain
        const response = await HybridModelRouter.executeWithFallbackChain(
          AIService.executeWithContinuation.bind(AIService),
          AIService.checkStatus.bind(AIService),
          routing.modelId,
          routing.provider,
          promptPayload,
          options.apiKeys,
          systemPrompt,
          options.modelSettings,
          isFinalOutput
            ? (chunk: string) => {
                const elapsed = Date.now() - startTime;
                const tokens = countTokens(chunk);
                const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;
                const streamMetrics = { latency: elapsed, tokens, tps };

                options.updateMetrics(streamMetrics);
                options.updateHistory((prev: ChatMessage[]) => {
                  const h = [...prev];
                  const last = h[h.length - 1];
                  if (last && last.role === 'assistant') {
                    last.content = chunk;
                    last.metrics = streamMetrics;
                  }
                  return h;
                });
              }
            : undefined,
          this.controller?.signal
        );

        finalText = response.text;
        finalMetrics = response.metrics;

        // Parse tool calls
        const toolCalls = this.parseToolCalls(finalText);
        if (toolCalls.length === 0) {
          // No tools to execute, final output reached
          break;
        }

        messages.push({ role: 'assistant', content: finalText, timestamp: Date.now() });

        // Execute tool calls
        const toolOutputs: string[] = [];
        for (const call of toolCalls) {
          try {
            const result = await ToolExecutor.execute(
              call.tool,
              call.params,
              this.controller?.signal ?? undefined
            );

            // Self-Correction & validation loop on file creation/modification
            let validationResult = '';
            if (
              task.type === 'coder' &&
              (call.tool === 'write_file' || call.tool === 'edit_file')
            ) {
              validationResult = await this.runValidationLoop(call.params.path, options.apiKeys);
            }

            toolOutputs.push(
              `[TOOL RESULT - ${call.tool}]\n${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}\n${validationResult}`
            );
          } catch (err: any) {
            toolOutputs.push(`[TOOL ERROR - ${call.tool}]\n${err.message || err}`);
          }
        }

        messages.push({
          role: 'user',
          content: `Tool Execution Outputs:\n\n${toolOutputs.join('\n\n')}\n\nReview these outputs and proceed with additional tool execution or formulate your final response.`,
          timestamp: Date.now(),
        });
      }

      const subagentResult: SubagentResult = {
        taskId: task.id,
        output: finalText,
        metrics: finalMetrics,
        modelUsed: routing,
        timestamp: Date.now(),
      };

      this.results.set(task.id, subagentResult);
      task.result = subagentResult;
      task.status = 'completed';
      options.trackUsage(routing.provider, finalMetrics.tokens);

      if (isFinalOutput) {
        options.updateHistory((prev: ChatMessage[]) => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant') {
            last.content = finalText;
            last.status = 'success';
            last.metrics = finalMetrics;
          }
          return h;
        });
        options.getSuggestions(options.history);
        options.triggerBackgroundCritic?.(originalPrompt, finalText);
      }

      this.emitUpdate();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      task.status = 'failed';

      const failResult: SubagentResult = {
        taskId: task.id,
        output: '',
        metrics: { latency: 0, tokens: 0, tps: 0 },
        modelUsed: task.assignedModel ?? FALLBACK_ROUTING_DECISION,
        timestamp: Date.now(),
        error: msg,
      };
      this.results.set(task.id, failResult);
      task.result = failResult;
      this.emitUpdate();

      if (msg === 'AbortError' || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
    }
  }

  // ── Validation and Self-Correction Loop ───────────────────────────────────

  private async runValidationLoop(
    filePath: string,
    apiKeys: Record<string, string>
  ): Promise<string> {
    let attempts = 0;
    const maxValidationAttempts = 3;

    while (attempts < maxValidationAttempts) {
      attempts++;
      console.log(
        `[Validation] Running linter/compiler checks for ${filePath} (Attempt ${attempts}/${maxValidationAttempts})`
      );

      try {
        const data = await validateWorkspace();
        if (data.success) {
          console.log(`[Validation] Verification passed for ${filePath}!`);
          return `[VALIDATION SUCCESS] Linter/compiler check passed. No issues found.`;
        } else {
          console.warn(`[Validation] Verification failed:`, data.error);

          if (attempts >= maxValidationAttempts) {
            return `[VALIDATION FAILURE] Compile/linter check failed after max attempts. Error log:\n${data.error}`;
          }

          // Trigger dynamic self-correction run
          console.log(`[Validation] Requesting self-correction patch for: ${filePath}`);
          const prompt = `The changes made to "${filePath}" caused compile/linter issues.
Error logs:
${data.error}

Please identify the compile/syntax/import issue, generate the corrected complete file content, and invoke the edit_file tool to fix it.`;

          const response = await AIService.execute(
            'openrouter/meta-llama/llama-3.3-70b-instruct:free',
            'openrouter',
            prompt,
            apiKeys['openrouter'] || '',
            'You are NYX Coder. Correct compile errors and write clean production-ready code. Output edit_file tool block.',
            { temperature: 0.1, maxTokens: 4009 }
          );

          const toolCalls = this.parseToolCalls(response.text);
          const editCall = toolCalls.find((c) => c.tool === 'edit_file' || c.tool === 'write_file');

          if (editCall) {
            await ToolExecutor.execute(
              editCall.tool,
              editCall.params,
              this.controller?.signal ?? undefined
            );
          } else {
            return `[VALIDATION FAILURE] Validation failed and corrector did not supply edit tool call. Logs:\n${data.error}`;
          }
        }
      } catch (err: any) {
        return `[VALIDATION ERROR] An error occurred in compile check loop: ${err.message || err}`;
      }
    }

    return `[VALIDATION FAILURE] Verification timed out.`;
  }

  // ── Helper Parsers ─────────────────────────────────────────────────────────

  private parseToolCalls(text: string): Array<{ tool: string; params: Record<string, any> }> {
    const regex = /```json\s*(\{[\s\S]*?\})\s*```/g;
    const calls: Array<{ tool: string; params: Record<string, any> }> = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && typeof parsed.tool === 'string') {
          calls.push(parsed);
        }
      } catch {}
    }

    // Direct JSON check (for models that output raw JSON)
    if (calls.length === 0 && text.trim().startsWith('{') && text.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(text.trim());
        if (parsed && typeof parsed.tool === 'string') {
          calls.push(parsed);
        }
      } catch {}
    }

    return calls;
  }

  // ── Handoff Specification Builder ──────────────────────────────────────────

  private async buildHandoffSpec(
    task: SubagentTask,
    originalPrompt: string,
    options: OrchestratorOptions
  ): Promise<string> {
    const parentOutputs: string[] = [];
    for (const depId of task.dependencies) {
      const depResult = this.results.get(depId);
      if (depResult) {
        let excerpt = depResult.output;
        if (excerpt.length > 1200) {
          excerpt = excerpt.slice(0, 1200) + '\n\n[... truncated for context window ...]';
        }
        parentOutputs.push(
          `## ${depResult.modelUsed.modelId} (task ${depResult.taskId}) output:\n${excerpt}`
        );
      }
    }

    const profile = await WorkspaceIntelligence.getProfile();
    const workspaceProfileContext = `
[WORKSPACE METADATA]
Root: ${profile.rootPath}
Project Type: ${profile.projectType}
Package Manager: ${profile.packageManager}
Linter: ${profile.lintConfig || 'none'}
Test Framework: ${profile.testFramework || 'none'}
Entrypoints: ${profile.entryPoints.join(', ') || 'none'}
Recent Git Commits:
${profile.recentGitCommits.map((c) => `- ${c}`).join('\n') || 'none'}
Open Files:
${profile.openFiles.map((f) => `- ${f}`).join('\n') || 'none'}
[END METADATA]`;

    let codebaseContext = '';
    if (options.codebaseKnowledgeEnabled && (task.type === 'coder' || task.type === 'researcher')) {
      try {
        const data = await searchCodebase(originalPrompt, this.controller?.signal ?? undefined);
        if (data.success && Array.isArray(data.results)) {
          const resultsStr = data.results
            .map(
              (f: any) =>
                `File: ${f.relativePath ?? f.path} (score: ${f.relevanceScore ?? f.score ?? 0})\n\`\`\`\n${f.content}\n\`\`\``
            )
            .join('\n\n');
          codebaseContext = `[LOCAL CODEBASE CONTEXT]\nDIRECTORY STRUCTURE:\n${data.directoryStructure ?? ''}\n\nRELEVANT FILES:\n${resultsStr}\n[END CODEBASE CONTEXT]`;
        }
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError'))
          throw err;
        console.warn('[SubagentOrchestrator] Codebase search failed:', err);
      }
    }

    let webContext = '';
    if (options.webSearchEnabled && (task.type === 'researcher' || task.type === 'coder')) {
      try {
        const data = await searchWeb(originalPrompt, this.controller?.signal ?? undefined);
        if (data.success && Array.isArray(data.results)) {
          const resultsStr = data.results
            .map(
              (r: any, idx: number) =>
                `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`
            )
            .join('\n\n');
          webContext = `[WEB SEARCH CONTEXT]\n${resultsStr}\n[END WEB SEARCH]`;
        }
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError'))
          throw err;
        console.warn('[SubagentOrchestrator] Web search failed:', err);
      }
    }

    const sections = [
      `Original Task: ${originalPrompt}`,
      `Your Subtask: ${task.description}`,
      `Type: ${task.type}`,
      `Complexity: ${task.complexity}`,
      workspaceProfileContext,
      parentOutputs.length > 0
        ? `Parent Subagent Outputs:\n${parentOutputs.join('\n\n---\n\n')}`
        : '',
      codebaseContext,
      webContext,
      'Execute your subtask precisely. Output complete, production-ready results. Do not truncate.',
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  private emitUpdate(): void {
    this.onTaskUpdate?.(Array.from(this.tasks.values()));
  }
}

/**
 * WRONG-5 fix: Use useRef instead of useCallback to maintain a stable orchestrator
 * instance across renders without recreating it unnecessarily.
 */
export function useSubagentOrchestrator() {
  const orchestratorRef = useRef<SubagentOrchestrator | null>(null);
  if (!orchestratorRef.current) {
    orchestratorRef.current = new SubagentOrchestrator();
  }
  const createOrchestrator = () => {
    orchestratorRef.current = new SubagentOrchestrator();
    return orchestratorRef.current;
  };
  return { createOrchestrator, orchestrator: orchestratorRef };
}
