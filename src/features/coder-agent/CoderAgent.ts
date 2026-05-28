import { AIService } from '@src/core/services/ai.service';
import { ChatMessage, AISettings, TelemetryMetrics, SubagentTask } from '@src/infrastructure/types';
import { PromptAnalysis, AgentRoute } from '@src/core/services/promptClassifier';
import { SubagentOrchestrator } from '@src/features/coder/hooks/useSubagentOrchestrator';
import {
  fetchEvolutionaryRules,
  searchCodebase,
  searchWeb,
} from '@src/features/coder/api/coderApi';
import { buildCoderSystemPrompt, buildCoderUserPrompt, CodeContext } from './promptBuilders';

export interface CoderAgentConfig {
  modelId: string;
  provider: string;
  apiKey: string;
  settings: AISettings;
  history: ChatMessage[];
  workspacePath?: string;
  // Options for subagent execution and callback hooks
  apiKeys: Record<string, string>;
  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
  trackUsage: (provider: string, tokens: number) => void;
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  originalPrompt?: string;
  triggerBackgroundCritic?: (prompt: string, response: string) => Promise<void>;
  onSubagentTaskUpdate?: (tasks: SubagentTask[]) => void;
  lightningDirectives?: string[];
}

export class CoderAgent {
  private config: CoderAgentConfig;

  constructor(config: CoderAgentConfig) {
    this.config = config;
  }

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    route: AgentRoute,
    signal: AbortSignal
  ): AsyncGenerator<{
    type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'file_write' | 'error';
    content: string;
    metadata?: any;
  }> {
    // Phase 1: Gather context (parallel where possible)
    yield { type: 'thinking', content: 'Analyzing task and gathering context...' };

    const context = await this.gatherContext(prompt, analysis, route.tools, signal);

    // Phase 2: Route to appropriate pipeline
    if (route.shouldUseSubagents) {
      yield* this.runSubagentPipeline(prompt, context, analysis, signal);
    } else {
      yield* this.runSingleAgentPipeline(prompt, context, analysis, signal);
    }
  }

  private async gatherContext(
    prompt: string,
    analysis: PromptAnalysis,
    tools: string[],
    signal: AbortSignal
  ): Promise<{ codebase?: string; webSearch?: string; rules?: string[] }> {
    const context: any = {};

    const promises: Promise<any>[] = [];

    if (tools.includes('codebase_search') && this.config.codebaseKnowledgeEnabled) {
      promises.push(this.searchCodebase(prompt, signal).then((r) => (context.codebase = r)));
    }

    if (tools.includes('web_search') && this.config.webSearchEnabled) {
      promises.push(this.webSearch(prompt, signal).then((r) => (context.webSearch = r)));
    }

    promises.push(this.fetchRules().then((r) => (context.rules = r)));

    await Promise.all(promises);
    return context;
  }

  private async *runSingleAgentPipeline(
    prompt: string,
    context: any,
    analysis: PromptAnalysis,
    signal: AbortSignal
  ): AsyncGenerator<any> {
    const codeContext: CodeContext = {
      detectedLanguages: analysis.detectedLanguages,
      frameworks: analysis.frameworks,
      complexity: analysis.complexity,
      taskType: this.mapIntentToTaskType(analysis.intent),
      existingCode: this.extractExistingCode(prompt),
      lightningDirectives: this.config.lightningDirectives,
    };

    const systemPrompt = buildCoderSystemPrompt(this.config.modelId, codeContext);

    const finalPrompt = buildCoderUserPrompt(
      prompt,
      codeContext,
      context.codebase,
      context.webSearch
    );

    const chunks: string[] = [];
    let resolveStream: (() => void) | null = null;
    let finished = false;
    let streamError: any = null;

    const onStreamCallback = (accumulatedText: string) => {
      chunks.push(accumulatedText);
      if (resolveStream) {
        resolveStream();
      }
    };

    yield { type: 'thinking', content: 'Writing code...' };

    const runPromise = AIService.execute(
      this.config.modelId,
      this.config.provider,
      finalPrompt,
      this.config.apiKey,
      systemPrompt,
      { ...this.config.settings, temperature: 0.1 }, // Low temp for code accuracy
      onStreamCallback,
      signal,
      {
        history: this.config.history.slice(-10),
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

    while (!finished || chunks.length > 0) {
      if (chunks.length === 0) {
        await new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
        resolveStream = null;
      }
      if (streamError) {
        throw streamError;
      }
      if (chunks.length > 0) {
        const content = chunks[chunks.length - 1];
        chunks.length = 0;
        yield { type: 'text', content };
      }
    }

    const result = await runPromise;
    if (result) {
      // Detect file writes in response
      const files = this.extractFileBlocks(result.text);
      if (files.length > 0) {
        yield { type: 'thinking', content: `Writing ${files.length} files...` };
        for (const file of files) {
          yield { type: 'file_write', content: file.path, metadata: file };
        }
      }

      yield { type: 'text', content: result.text, metadata: result.metrics };
    }
  }

  private async *runSubagentPipeline(
    prompt: string,
    _context: any,
    _analysis: PromptAnalysis,
    signal: AbortSignal
  ): AsyncGenerator<any> {
    yield { type: 'thinking', content: 'Planning implementation and starting subagent swarm...' };

    const orchestrator = new SubagentOrchestrator();
    if (this.config.onSubagentTaskUpdate) {
      orchestrator.onTaskUpdate = this.config.onSubagentTaskUpdate;
    }

    const results = await orchestrator.execute(prompt, {
      apiKeys: this.config.apiKeys,
      modelSettings: this.config.settings,
      trackUsage: this.config.trackUsage,
      history: this.config.history,
      updateHistory: this.config.updateHistory,
      updateMetrics: this.config.updateMetrics,
      getSuggestions: this.config.getSuggestions,
      setSuggestedPrompts: this.config.setSuggestedPrompts,
      webSearchEnabled: this.config.webSearchEnabled,
      codebaseKnowledgeEnabled: this.config.codebaseKnowledgeEnabled,
      signal,
      originalPrompt: this.config.originalPrompt || prompt,
      triggerBackgroundCritic: this.config.triggerBackgroundCritic,
    });

    yield { type: 'tool_result', content: 'Subagent swarm execution complete.', metadata: results };
  }

  private mapIntentToTaskType(intent: string): CodeContext['taskType'] {
    switch (intent) {
      case 'code_generation':
        return 'generate';
      case 'code_debug':
        return 'debug';
      case 'code_review':
        return 'review';
      case 'refactor':
        return 'refactor';
      case 'explain_code':
        return 'explain';
      default:
        return 'generate';
    }
  }

  private extractExistingCode(prompt: string): string | undefined {
    const codeBlockMatch = prompt.match(/```[\w]*\n([\s\S]*?)```/);
    return codeBlockMatch ? codeBlockMatch[1] : undefined;
  }

  /**
   * UGLY-2 fix: Regex is now whitespace-tolerant — handles variations in:
   * - Spaces around the === FILE: ... === marker
   * - Optional language identifier in the code fence
   * - Windows-style \r\n vs Unix \n line endings
   */
  private extractFileBlocks(text: string): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];
    // Tolerant regex: whitespace-flexible markers, optional lang id, CRLF/LF support
    const regex = /===\s*FILE:\s*([^\n\r]+?)\s*===[\r\n]+```[\w]*[\r\n]+([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      if (filePath) {
        files.push({ path: filePath, content });
      }
    }
    return files;
  }

  private async searchCodebase(query: string, signal: AbortSignal): Promise<string> {
    try {
      const data = await searchCodebase(query, signal);
      if (data.success) {
        const results = data.results || [];
        const resultsStr = results
          .map(
            (f: any) =>
              `File: ${f.relativePath || f.path} (Relevance Score: ${f.relevanceScore || f.score})\n\`\`\`\n${f.content}\n\`\`\``
          )
          .join('\n\n');
        return `\n\n[LOCAL CODEBASE CONTEXT]\nDIRECTORY STRUCTURE:\n${data.directoryStructure || ''}\n\nRELEVANT SOURCE CODE FILES:\n${resultsStr}\n[END CODEBASE CONTEXT]\n`;
      }
      return '';
    } catch (err) {
      console.error('Codebase search failed:', err);
      return '';
    }
  }

  private async webSearch(query: string, signal: AbortSignal): Promise<string> {
    try {
      const data = await searchWeb(query, signal);
      if (data.success && Array.isArray(data.results)) {
        const resultsStr = data.results
          .map(
            (r: any, idx: number) =>
              `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`
          )
          .join('\n\n');
        return `\n\nADDITIONAL WEB SEARCH RESULTS:\n${resultsStr}\n`;
      }
      return '';
    } catch (err) {
      console.error('Web search failed:', err);
      return '';
    }
  }

  private async fetchRules(): Promise<string[]> {
    try {
      const rules = await fetchEvolutionaryRules();
      return Array.isArray(rules) ? rules : [];
    } catch {
      return [];
    }
  }
}
