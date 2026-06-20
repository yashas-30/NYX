// @ts-nocheck
import { AIService } from '@src/infrastructure/api/ai.service';
import {
  ChatMessage,
  TelemetryMetrics,
  CoderStreamEvent,
  ToolCall,
} from '@src/infrastructure/types';
import { PromptAnalysis, AgentRoute } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig, HISTORY_SLICE_SIZE } from '@src/core/agents/baseAgent';
import { NYX_TOOLS } from '../tools/nyxTools';
import { executeTool } from '../tools/toolExecutor';

export interface CoderAgentConfig extends BaseAgentConfig {
  workspacePath?: string;
  apiKeys: Record<string, string>;
  trackUsage: (provider: string, tokens: number) => void;
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  validateCode?: boolean;
  showReasoning?: boolean;
  confirmTool?: (toolName: string, args: any) => Promise<boolean>;
}

const MAX_ROUNDS = 10;

export class CoderAgentWithTools extends BaseAgent<CoderAgentConfig, CoderStreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    route: AgentRoute,
    signal: AbortSignal
  ): AsyncGenerator<CoderStreamEvent> {
    const reasoningChain: string[] = [];
    yield* this.emitThinking('Starting Tool Execution Loop...', reasoningChain);

    let processedHistory = [...this.config.history];
    if (processedHistory.length > HISTORY_SLICE_SIZE) {
      processedHistory = processedHistory.slice(-HISTORY_SLICE_SIZE);
    }

    const systemInstruction = `You are NYX Coder Agent. 
You have access to native tools. Use them to gather context, read files, execute commands, and search the web.
ALWAYS confirm before making destructive changes.
When you write code, explain what you are doing.
If you use search results, YOU MUST cite your sources using inline links [Source Name](url).`;

    let currentHistory = [...processedHistory];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (signal.aborted) break;
      yield* this.emitThinking(`Round ${round + 1} / ${MAX_ROUNDS}`, reasoningChain);

      let lastEmittedLength = 0;
      const chunks: string[] = [];
      let resolveStream: (() => void) | null = null;
      let finished = false;
      let streamError: any = null;

      const onStreamCallback = (event: any) => {
        if (event && event.type === 'text') {
          const delta = event.content.slice(lastEmittedLength);
          if (delta) {
            chunks.push(delta);
            lastEmittedLength = event.content.length;
          }
        }
        if (event && event.type === 'tool_calls') {
          // Tool calls are accumulated and passed in event.content
        }
        if (resolveStream) resolveStream();
      };

      const availableTools = NYX_TOOLS.filter(
        (t) => t.name !== 'web_search' || this.config.webSearchEnabled
      );

      const runPromise = AIService.execute(
        this.config.modelId,
        this.config.provider,
        round === 0 ? prompt : 'Please continue using tools or provide final response.',
        this.config.apiKey,
        systemInstruction,
        { ...this.config.settings, temperature: 0.1 },
        onStreamCallback,
        signal,
        // fallow-ignore-next-line code-duplication
        {
          history: currentHistory,
          agentMode: 'coder',
          tools: availableTools,
          streamEvents: true,
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
        if (signal.aborted) break;
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => {
            resolveStream = resolve;
          });
          resolveStream = null;
        }

        if (streamError) throw streamError;

        while (chunks.length > 0) {
          const content = chunks.shift()!;
          yield { type: 'text', content };
        }
      }

      const response = await runPromise;
      if (!response) throw new Error('No response from AIService');

      if (response.text.length > lastEmittedLength) {
        yield { type: 'text', content: response.text.slice(lastEmittedLength) };
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        yield* this.emitThinking(`Executing ${response.toolCalls.length} tools...`, reasoningChain);

        // Push the assistant message with tool calls to history
        currentHistory.push({
          role: 'assistant',
          content: response.text || 'Calling tools...',
          timestamp: Date.now(),
          // We need to store tool_calls in history for Gemini, but AIService doesn't strictly support it yet.
          // For now we assume standard string format or just skip appending the exact tool calls to history
          // because Gemini SDK handles it internally if we pass it, but wait! We are managing history manually.
        });

        const toolResponses = [];
        for (const call of response.toolCalls) {
          yield { type: 'tool_call', content: `Running ${call.function.name}...`, metadata: call };

          let args;
          try {
            args = JSON.parse(call.function.arguments);
          } catch (e) {
            args = call.function.arguments;
          }

          let result;

          if (
            this.config.confirmTool &&
            (call.function.name === 'write_file' || call.function.name === 'run_command')
          ) {
            yield {
              type: 'tool_call',
              content: `Waiting for user confirmation to run ${call.function.name}...`,
              metadata: call,
            };
            const approved = await this.config.confirmTool(call.function.name, args);
            if (!approved) {
              result = { success: false, result: null, error: 'User rejected tool execution.' };
            }
          }

          if (!result) {
            result = await executeTool(
              call.function.name,
              args,
              this.config.workspacePath || '',
              signal
            );
          }

          yield {
            type: 'tool_result',
            content: `Completed ${call.function.name}`,
            metadata: { id: call.id, result: result.success ? 'Success' : 'Failed' },
          };

          toolResponses.push({
            id: call.id,
            name: call.function.name,
            response: result,
          });
        }

        currentHistory.push({
          role: 'user', // function responses usually go as user or function role
          content: JSON.stringify({ functionResponses: toolResponses }),
          timestamp: Date.now(),
        });
      } else {
        // No more tool calls, break the loop
        yield* this.emitThinking('Task complete.', reasoningChain);
        break;
      }
    }
  }

  // Fallback map tools
  protected getAdaptiveTemperature(intent: string): number {
    return 0.1;
  }
}


