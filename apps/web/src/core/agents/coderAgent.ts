import { AIService } from '@src/core/services/ai.service';
import {
  ChatMessage,
  AISettings,
  TelemetryMetrics,
  SubagentTask,
  ISubagentOrchestrator,
  CoderStreamEventType,
  CoderStreamEvent,
  FileProposal,
  ValidationResult,
} from '@src/infrastructure/types';
import { PromptAnalysis, AgentRoute } from '@src/core/services/promptClassifier';
import { fetchEvolutionaryRules, writeFile } from '@src/infrastructure/api/coderApi';
import { searchCodebase, searchWeb } from '@src/infrastructure/api/searchApi';
import { buildCoderPrompts, CodeContext } from '../prompts/coderPrompts';
import { BaseAgent, BaseAgentConfig, HISTORY_SLICE_SIZE } from './baseAgent';

// ── Retry Configuration ──────────────────────────────────────────────────────

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

// ── Enhanced CoderAgent ──────────────────────────────────────────────────────

export interface CoderAgentConfig extends BaseAgentConfig {
  workspacePath?: string;
  apiKeys: Record<string, string>;
  codebaseKnowledgeEnabled: boolean;
  trackUsage: (provider: string, tokens: number) => void;
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  originalPrompt?: string;
  triggerBackgroundCritic?: (prompt: string, response: string) => Promise<void>;
  onSubagentTaskUpdate?: (tasks: SubagentTask[]) => void;
  createOrchestrator?: () => ISubagentOrchestrator;
  validateCode?: boolean;
  showReasoning?: boolean;
}

export class CoderAgent extends BaseAgent<CoderAgentConfig, CoderStreamEvent> {
  private retryConfig: RetryConfig;

  constructor(config: CoderAgentConfig) {
    super(config);
    this.retryConfig = DEFAULT_RETRY;
  }

  // ── Public API: Main Stream ───────────────────────────────────────────────

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    route: AgentRoute,
    signal: AbortSignal
  ): AsyncGenerator<CoderStreamEvent> {
    const startTime = Date.now();
    const reasoningChain: string[] = [];

    try {
      // Phase 1: Planning & Reasoning (Claude-style visible thinking)
      yield* this.emitThinking('Analyzing task requirements...', reasoningChain);
      yield* this.emitThinking(
        `Detected intent: ${analysis.intent}, complexity: ${analysis.complexity}`,
        reasoningChain
      );
      yield* this.emitThinking(
        `Required tools: ${route.tools.join(', ') || 'none'}`,
        reasoningChain
      );

      if (route.shouldUseSubagents) {
        yield* this.emitThinking(
          'Task complexity warrants subagent swarm approach',
          reasoningChain
        );
      } else {
        yield* this.emitThinking('Single-agent pipeline sufficient for this task', reasoningChain);
      }

      // Phase 2: Gather context with parallel execution and retry
      yield* this.emitThinking('Gathering context from available sources...', reasoningChain);

      const context = await this.gatherContextWithRetry(
        prompt,
        analysis,
        route.tools,
        signal,
        (msg) => {
          // Emit sub-thinkings during context gathering
          reasoningChain.push(msg);
        }
      );

      yield* this.emitThinking(
        `Context gathered: ${context.codebase ? 'codebase ✓' : 'codebase ✗'} ${context.webSearch ? 'web ✓' : 'web ✗'} ${context.rules?.length ? 'rules ✓' : 'rules ✗'}`,
        reasoningChain
      );

      // Phase 3: Route to pipeline
      if (route.shouldUseSubagents && this.config.createOrchestrator) {
        yield* this.runSubagentPipeline(prompt, context, analysis, signal, reasoningChain);
      } else {
        yield* this.runSingleAgentPipeline(
          prompt,
          context,
          analysis,
          signal,
          reasoningChain,
          startTime
        );
      }

      // Phase 4: Background critic (non-blocking)
      if (this.config.triggerBackgroundCritic) {
        this.config.triggerBackgroundCritic(prompt, reasoningChain.join('\n')).catch(() => {});
      }
    } catch (err: any) {
      yield {
        type: 'error',
        content: err instanceof Error ? err.message : 'Unknown error occurred',
        metadata: { stack: err instanceof Error ? err.stack : undefined, phase: 'main' },
      };
    }
  }

  // ── Context Gathering with Retry & Budget ─────────────────────────────────

  private async gatherContextWithRetry(
    prompt: string,
    analysis: PromptAnalysis,
    tools: string[],
    signal: AbortSignal,
    onProgress: (msg: string) => void
  ): Promise<{ codebase?: string; webSearch?: string; rules?: string[] }> {
    const context: {
      codebase?: string;
      webSearch?: string;
      rules?: string[];
      rawWebSearchResults?: any[];
    } = {};

    const budgets = this.tokenBudget.distribute({
      codebase: 6000,
      webSearch: 4000,
      rules: 2000,
    });

    const tasks: Promise<void>[] = [];

    // Codebase search with retry
    const needsCodebase =
      prompt.includes('@codebase') ||
      analysis.intent === 'architecture_design' ||
      analysis.intent === 'refactor';
    if (
      tools.includes('codebase_search') &&
      this.config.codebaseKnowledgeEnabled &&
      needsCodebase
    ) {
      tasks.push(
        this.withRetry(
          () => this.searchCodebase(prompt, signal),
          'codebase_search',
          (result) => {
            context.codebase = this.tokenBudget.truncate(result, budgets.codebase || 6000);
            onProgress(`Found ${result.length} chars of codebase context`);
          },
          (err) => {
            onProgress(`Codebase search failed: ${err.message}`);
          }
        )
      );
    }

    // Web search with retry
    if (tools.includes('web_search') && this.config.webSearchEnabled) {
      tasks.push(
        this.withRetry(
          () => this.webSearch(prompt, signal),
          'web_search',
          (result) => {
            context.webSearch = this.tokenBudget.truncate(
              result.formatted,
              budgets.webSearch || 4000
            );
            context.rawWebSearchResults = result.raw;
            onProgress(`Found ${result.formatted.length} chars of web context`);
          },
          (err) => {
            onProgress(`Web search failed: ${err.message}`);
          }
        )
      );
    }

    // Rules fetch with retry
    tasks.push(
      this.withRetry(
        () => this.fetchRules(),
        'fetch_rules',
        (result) => {
          context.rules = result.slice(0, 20); // Max 20 rules
          onProgress(`Loaded ${result.length} evolutionary rules`);
        },
        () => {
          onProgress('Rules fetch failed, continuing without');
        }
      )
    );

    await Promise.all(tasks);
    return context;
  }

  // ── Single Agent Pipeline (Streaming with Delta Tracking) ─────────────────

  private async *runSingleAgentPipeline(
    prompt: string,
    context: any,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    reasoningChain: string[],
    startTime: number
  ): AsyncGenerator<CoderStreamEvent> {
    const codeContext: CodeContext = {
      detectedLanguages: analysis.detectedLanguages,
      frameworks: analysis.frameworks,
      complexity: this.mapComplexity(analysis.complexity),
      taskType: this.mapIntentToTaskType(analysis.intent),
      existingCode: this.extractExistingCode(prompt),
      lightningDirectives: this.config.lightningDirectives,
    };

    yield* this.emitThinking('Building optimized prompts...', reasoningChain);

    if (context.rawWebSearchResults && context.rawWebSearchResults.length > 0) {
      for (let i = 0; i < context.rawWebSearchResults.length && i < 5; i++) {
        const r = context.rawWebSearchResults[i];
        yield {
          type: 'citation',
          content: '',
          // fallow-ignore-next-line code-duplication
          metadata: {
            id: String(i + 1),
            url: r.url || r.link,
            title: r.title,
            snippet: r.snippet,
            source: r.source || new URL(r.url || r.link || 'https://unknown').hostname,
          },
        };
      }
    }

    let processedHistory = this.config.history;
    if (processedHistory.length > HISTORY_SLICE_SIZE) {
      const olderMessages = processedHistory.slice(0, processedHistory.length - HISTORY_SLICE_SIZE);
      const recentMessages = processedHistory.slice(-HISTORY_SLICE_SIZE);
      const summaryText = olderMessages
        .map(
          (m) => `${m.role.toUpperCase()}: ${m.content.substring(0, 150).replace(/\n/g, ' ')}...`
        )
        .join('\n');
      processedHistory = [
        {
          role: 'user', // use 'user' or 'assistant' based on backend support, 'user' is safest
          content: `[Summarized previous context to save tokens]\n${summaryText}`,
          timestamp: Date.now(),
        },
        ...recentMessages,
      ];
    }

    const {
      systemPrompt,
      userPrompt: finalPrompt,
      metadata,
    } = buildCoderPrompts(
      this.config.modelId,
      codeContext,
      prompt,
      processedHistory,
      context.codebase,
      context.webSearch
    );

    if (metadata?.estimatedTokens) {
      this.tokenBudget.consume(metadata.estimatedTokens);
    }

    // Adaptive temperature based on task
    const temperature = this.getAdaptiveTemperature(analysis.intent);

    yield* this.emitThinking(
      `Using temperature ${temperature} for ${analysis.intent} task`,
      reasoningChain
    );

    // Setup streaming with proper delta tracking
    let lastEmittedLength = 0;
    const chunks: string[] = [];
    let resolveStream: (() => void) | null = null;
    let finished = false;
    let streamError: any = null;

    const onStreamCallback = (accumulatedText: string) => {
      // Only push the NEW text (delta), not the full accumulated text
      const delta = accumulatedText.slice(lastEmittedLength);
      if (delta) {
        chunks.push(delta);
        lastEmittedLength = accumulatedText.length;
      }
      if (resolveStream) resolveStream();
    };

    yield* this.emitThinking('Starting code generation stream...', reasoningChain);

    const runPromise = AIService.execute(
      this.config.modelId,
      this.config.provider,
      finalPrompt,
      this.config.apiKey,
      systemPrompt,
      { ...this.config.settings, temperature },
      onStreamCallback,
      signal,
      // fallow-ignore-next-line code-duplication
      {
        history: processedHistory,
        agentMode: 'coder',
        webSearch: this.config.webSearchEnabled,
      }
    )
      .then((result) => {
        finished = true;
        if (resolveStream) resolveStream();
        return result;
      })
      .catch((err) => {
        streamError = err;
        finished = true;
        if (resolveStream) resolveStream();
      });

    // Stream processing with backpressure protection
    const MAX_QUEUE_SIZE = 100;
    let queueOverflow = false;

    while (!finished || chunks.length > 0) {
      if (signal.aborted) break;
      if (chunks.length === 0) {
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            resolve();
          };
          signal.addEventListener('abort', onAbort, { once: true });

          resolveStream = () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          };
        });
        resolveStream = null;
      }

      if (signal.aborted) break;
      if (streamError) throw streamError;

      if (chunks.length > MAX_QUEUE_SIZE && !queueOverflow) {
        queueOverflow = true;
        yield {
          type: 'warning',
          content:
            'Generation is producing text faster than display. Some intermediate states may be skipped.',
        };
      }

      // Drain chunks efficiently
      while (chunks.length > 0) {
        const content = chunks.shift()!;
        yield { type: 'text', content };
      }
    }

    const result = await runPromise;
    if (!result) throw new Error('No result from AIService');

    // Emit any remaining text
    if (result.text.length > lastEmittedLength) {
      yield { type: 'text', content: result.text.slice(lastEmittedLength) };
    }

    // Phase: File extraction
    yield* this.emitThinking('Extracting file proposals from response...', reasoningChain);

    const files = this.extractFileBlocks(result.text);
    const codeBlocks = this.extractMarkdownCodeBlocks(result.text);

    // Yield file proposals
    for (const file of files) {
      yield {
        type: 'file_proposal',
        content: file.path,
        metadata: {
          language: file.language,
          lineCount: file.content.split('\n').length,
          size: file.content.length,
        },
      };
    }

    // Yield standalone code blocks (not in === FILE: === format)
    for (const block of codeBlocks) {
      if (!files.some((f) => f.content === block.content)) {
        yield {
          type: 'code_block',
          content: block.language || 'code',
          metadata: { language: block.language, content: block.content },
        };
      }
    }

    // Phase: File writes
    if (files.length > 0) {
      yield* this.emitThinking(`Writing ${files.length} files...`, reasoningChain);
      for (const file of files) {
        try {
          // Additional validation
          if (file.path.includes('..')) {
            throw new Error(`Invalid file path (traversal detected): ${file.path}`);
          }

          const fullPath = this.config.workspacePath
            ? `${this.config.workspacePath}/${file.path}`.replace(/\/+/g, '/')
            : file.path;

          if (this.config.workspacePath && !fullPath.startsWith(this.config.workspacePath)) {
            throw new Error(`Invalid file path (outside workspace): ${file.path}`);
          }
          yield {
            type: 'file_write',
            content: fullPath,
            metadata: {
              path: fullPath,
              language: file.language,
              lineCount: file.content.split('\n').length,
              content: file.content,
            },
          };
        } catch (writeErr: any) {
          yield {
            type: 'file_error',
            content: `Failed to write ${file.path}: ${writeErr instanceof Error ? writeErr.message : 'Unknown error'}`,
            metadata: { path: file.path },
          };
        }
      }
    }

    // Phase: Code validation (optional)
    if (this.config.validateCode) {
      yield* this.emitThinking('Running code validation...', reasoningChain);
      const validations = await this.validateGeneratedCode(files, codeBlocks);
      for (const v of validations) {
        yield {
          type: 'validation',
          content: v.message,
          metadata: { passed: v.passed, type: v.type, details: v.details },
        };
      }
    }

    // Final completion
    yield {
      type: 'complete',
      content: 'Generation complete',
      metadata: {
        durationMs: Date.now() - startTime,
        totalFiles: files.length,
        totalCodeBlocks: codeBlocks.length,
        modelUsed: this.config.modelId,
        temperature,
        reasoningSteps: reasoningChain.length,
        metrics: result.metrics,
      },
    };

    // Background: Update history and metrics
    this.config.updateHistory((prev) => [
      ...prev,
      { role: 'assistant', content: result.text, timestamp: Date.now() },
    ]);

    if (result.metrics) {
      this.config.updateMetrics(result.metrics);
    }
  }

  // ── Subagent Pipeline (Streaming) ─────────────────────────────────────────

  private async *runSubagentPipeline(
    prompt: string,
    context: any,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    reasoningChain: string[]
  ): AsyncGenerator<CoderStreamEvent> {
    yield* this.emitThinking('Planning implementation architecture...', reasoningChain);

    if (!this.config.createOrchestrator) {
      throw new Error('createOrchestrator is required for subagent swarm execution.');
    }

    const orchestrator = this.config.createOrchestrator();

    // Setup task update streaming
    let lastTaskCount = 0;
    const taskQueue: SubagentTask[] = [];
    let queueResolve: (() => void) | null = null;

    orchestrator.onTaskUpdate = (tasks) => {
      const newTasks = tasks.slice(lastTaskCount);
      lastTaskCount = tasks.length;
      for (const task of newTasks) {
        taskQueue.push(task);
      }
      if (queueResolve) queueResolve();
      if (this.config.onSubagentTaskUpdate) {
        this.config.onSubagentTaskUpdate(tasks);
      }
    };

    yield* this.emitThinking('Starting subagent swarm execution...', reasoningChain);

    try {
      let executeFinished = false;
      let executeError: any = null;
      let executeResult: any = null;

      const executePromise = orchestrator
        .execute(prompt, {
          apiKeys: this.config.apiKeys,
          modelSettings: this.config.settings,
          trackUsage: this.config.trackUsage,
          history: this.config.history,
          updateHistory: this.config.updateHistory,
          updateMetrics: this.config.updateMetrics,
          getSuggestions: this.config.getSuggestions,
          setSuggestedPrompts: this.config.setSuggestedPrompts,
          webSearchEnabled: this.config.webSearchEnabled ?? false,
          codebaseKnowledgeEnabled: this.config.codebaseKnowledgeEnabled ?? false,
          signal,
          originalPrompt: this.config.originalPrompt || prompt,
          triggerBackgroundCritic: this.config.triggerBackgroundCritic,
        })
        .then((res) => {
          executeResult = res;
          executeFinished = true;
          if (queueResolve) queueResolve();
        })
        .catch((err) => {
          executeError = err;
          executeFinished = true;
          if (queueResolve) queueResolve();
        });

      while (!executeFinished || taskQueue.length > 0) {
        if (taskQueue.length === 0) {
          await new Promise<void>((resolve) => {
            queueResolve = resolve;
          });
          queueResolve = null;
        }

        while (taskQueue.length > 0) {
          const task = taskQueue.shift()!;
          const content = `Subagent task: [${task.type}] ${task.description} - ${task.status}`;
          reasoningChain.push(content);
          if (this.config.showReasoning !== false) {
            yield {
              type: 'thinking',
              content,
              metadata: { step: reasoningChain.length, source: 'subagent', task },
            };
          }
        }
      }

      if (executeError) throw executeError;

      const results = executeResult;

      // Stream subagent results as they complete
      if (Array.isArray(results)) {
        for (const result of results) {
          yield {
            type: 'tool_result',
            content: typeof result === 'string' ? result : JSON.stringify(result),
            metadata: { source: 'subagent' },
          };
        }
      }

      yield {
        type: 'complete',
        content: 'Subagent swarm execution complete',
        metadata: { results },
      };
    } catch (err: any) {
      yield {
        type: 'error',
        content: `Subagent pipeline failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        metadata: { phase: 'subagent' },
      };
      throw err;
    }
  }

  // ── Retry Utility ─────────────────────────────────────────────────────────

  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
    onSuccess: (result: T) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await fn();
        onSuccess(result);
        return;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.retryConfig.maxRetries - 1) {
          const delay = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(2, attempt),
            this.retryConfig.maxDelayMs
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    onError(
      lastError || new Error(`${operationName} failed after ${this.retryConfig.maxRetries} retries`)
    );
  }

  // ── Thinking Emission ─────────────────────────────────────────────────────

  protected *emitThinking(content: string, chain: string[]): Generator<CoderStreamEvent> {
    chain.push(content);
    if (this.config.showReasoning !== false) {
      yield { type: 'thinking', content, metadata: { step: chain.length } };
    }
  }

  // ── Adaptive Temperature ──────────────────────────────────────────────────

  private getAdaptiveTemperature(intent: string): number {
    switch (intent) {
      case 'code_generation':
      case 'refactor':
        return 0.1; // Precise, deterministic
      case 'code_debug':
        return 0.3; // Slightly creative for finding edge cases
      case 'code_review':
        return 0.2; // Balanced
      case 'explain_code':
        return 0.4; // More natural language variety
      case 'architecture_design':
        return 0.3; // Some creativity needed
      default:
        return 0.15;
    }
  }

  // ── Intent Mapping ────────────────────────────────────────────────────────

  private mapIntentToTaskType(intent: string): CodeContext['taskType'] {
    const map: Record<string, CodeContext['taskType']> = {
      code_generation: 'generate',
      code_debug: 'debug',
      code_review: 'review',
      refactor: 'refactor',
      explain_code: 'explain',
      testing: 'test',
      documentation: 'explain',
    };
    return map[intent] || 'generate';
  }

  private mapComplexity(comp: string): CodeContext['complexity'] {
    switch (comp) {
      case 'trivial':
      case 'simple':
        return 'low';
      case 'moderate':
        return 'medium';
      case 'complex':
        return 'high';
      case 'enterprise':
        return 'very_high';
      default:
        return 'medium';
    }
  }

  // ── Code Extraction ───────────────────────────────────────────────────────

  private extractExistingCode(prompt: string): string | undefined {
    const matches = prompt.matchAll(/```[\w]*\n([\s\S]*?)```/g);
    const codes: string[] = [];
    for (const match of matches) {
      codes.push(match[1]);
    }
    return codes.length > 0 ? codes.join('\n\n') : undefined;
  }

  /**
   * Extract === FILE: path === format (Claude Code style)
   */
  private extractFileBlocks(
    text: string
  ): Array<{ path: string; language: string; content: string }> {
    // fallow-ignore-next-line code-duplication
    const files: Array<{ path: string; language: string; content: string }> = [];

    // Prevent regex evaluation hanging on massive strings
    const MAX_PARSE_LENGTH = 100000;
    if (text.length > MAX_PARSE_LENGTH) {
      text = text.slice(0, MAX_PARSE_LENGTH);
    }

    const regex = /===\s*FILE:\s*([^\n\r]+?)\s*===[\r\n]+```(\w*)[\r\n]+([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const language = match[2] || this.inferLanguage(filePath);
      const content = match[3];
      if (filePath) {
        files.push({ path: filePath, language, content });
      }
    }
    return files;
  }

  /**
   * Extract markdown code blocks with optional filename in comment
   */
  private extractMarkdownCodeBlocks(
    text: string
  ): Array<{ language: string | null; content: string; filename?: string }> {
    // fallow-ignore-next-line code-duplication
    const blocks: Array<{ language: string | null; content: string; filename?: string }> = [];

    // Prevent regex evaluation hanging on massive strings
    const MAX_PARSE_LENGTH = 100000;
    if (text.length > MAX_PARSE_LENGTH) {
      text = text.slice(0, MAX_PARSE_LENGTH);
    }

    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const language = match[1] || null;
      const content = match[2];
      // Check for filename in first line comment
      const firstLine = content.split('\n')[0];
      const filenameMatch = firstLine.match(
        /\/\/\s*([^\s]+\.\w+)|#\s*([^\s]+\.\w+)|<!--\s*([^\s]+\.\w+)\s*-->/
      );
      blocks.push({
        language,
        content,
        filename: filenameMatch
          ? filenameMatch[1] || filenameMatch[2] || filenameMatch[3]
          : undefined,
      });
    }
    return blocks;
  }

  private inferLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      r: 'r',
      m: 'objectivec',
      sql: 'sql',
      sh: 'bash',
      ps1: 'powershell',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      md: 'markdown',
      dockerfile: 'dockerfile',
      tf: 'hcl',
    };
    return map[ext || ''] || 'text';
  }

  // ── Code Validation ──────────────────────────────────────────────────────────

  private async validateGeneratedCode(
    files: Array<{ path: string; language: string; content: string }>,
    blocks: Array<{ language: string | null; content: string }>
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    try {
      // Call actual backend validation
      const { validateWorkspace } = await import('@src/infrastructure/api/coderApi');
      const validationResponse = await validateWorkspace();

      if (validationResponse.valid) {
        results.push({
          passed: true,
          type: 'syntax',
          message: 'Workspace validation passed',
        });
      } else {
        const errors = validationResponse.errors || [];
        results.push({
          passed: false,
          type: 'syntax',
          message: `Workspace validation failed with ${errors.length} errors`,
          details: errors.join('\\n'),
        });
      }

      if (validationResponse.warnings?.length) {
        results.push({
          passed: true,
          type: 'lint',
          message: `Found ${validationResponse.warnings.length} warnings`,
          details: validationResponse.warnings.join('\\n'),
        });
      }
    } catch (err: any) {
      results.push({
        passed: false,
        type: 'syntax',
        message: 'Failed to run code validation',
        details: err instanceof Error ? err.message : String(err),
      });
    }

    // General size validation
    const totalLines = [...files, ...blocks].reduce(
      (sum, f) => sum + f.content.split('\\n').length,
      0
    );
    if (totalLines >= 1000) {
      results.push({
        passed: false,
        type: 'lint',
        message: `Warning: Large code output (${totalLines} lines), consider splitting`,
      });
    }

    return results;
  }

  // ── API Wrappers with Error Handling ──────────────────────────────────────

  private async searchCodebase(query: string, signal: AbortSignal): Promise<string> {
    const data = await searchCodebase(query, signal);
    if (!data.success) throw new Error(data.error || 'Codebase search failed');

    const results = data.results || [];
    const resultsStr = results
      .map(
        (f: any) =>
          `File: ${f.relativePath || f.path} (Score: ${f.relevanceScore || f.score})\n\`\`\`\n${f.content}\n\`\`\``
      )
      .join('\n\n');

    return `\n\n[CODEBASE CONTEXT]\n${data.directoryStructure || ''}\n\n${resultsStr}\n[END CODEBASE CONTEXT]\n`;
  }

  private async webSearch(
    query: string,
    signal: AbortSignal
  ): Promise<{ raw: any[]; formatted: string }> {
    const data = await searchWeb(query, signal);
    if (!data.success) throw new Error(data.error || 'Web search failed');

    const results = data.results || [];
    const deduped = this.deduplicateByUrl(results);
    const resultsStr = deduped
      .slice(0, 5)
      .map((r: any, i: number) => {
        const url = r.link || r.url;
        let block = `[${i + 1}] ${r.title}\nURL: ${url}\nSnippet: ${r.snippet}`;
        if (r.content) {
          block += `\nFull Content Extracted:\n${r.content}`;
        }
        return block;
      })
      .join('\n\n---\n\n');

    const formatted = `\n\n[WEB SEARCH RESULTS]\n${resultsStr}\n[END WEB SEARCH]\n\n[CRITICAL INSTRUCTION: You MUST cite your sources using inline citations like [1], [2] when referencing the web search results above. Ensure the citation number matches the Source number.]\n`;
    return { raw: deduped, formatted };
  }

  private deduplicateByUrl(results: any[]): any[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      if (!r.link || seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    });
  }

  private async fetchRules(): Promise<string[]> {
    const rules = await fetchEvolutionaryRules();
    return Array.isArray(rules) ? rules : [];
  }
}
