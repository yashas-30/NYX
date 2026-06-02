import { AIService } from '@src/core/services/ai.service';
import { ChatMessage, StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig, HISTORY_SLICE_SIZE } from './baseAgent';
import { NYX_TOOLS } from '../tools/nyxTools';
import { executeTool } from '../tools/toolExecutor';

export interface ChatAgentConfig extends BaseAgentConfig {
  updateHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

const MAX_ROUNDS = 10;

export class ChatAgentWithTools extends BaseAgent<ChatAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const reasoningChain: string[] = [];
    yield* this.emitThinking('Starting Tool Execution Loop...', reasoningChain);

    let processedHistory = [...this.config.history];
    if (processedHistory.length > HISTORY_SLICE_SIZE) {
      processedHistory = processedHistory.slice(-HISTORY_SLICE_SIZE);
    }

    const systemInstruction = `You are NYX Chat Agent.
You have access to native tools. Use them to gather context or read files.
Explain your thoughts and provide clear answers.`;

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
        if (resolveStream) resolveStream();
      };

      const runPromise = AIService.execute(
        this.config.modelId,
        this.config.provider,
        round === 0 ? prompt : 'Please continue using tools or provide final response.',
        this.config.apiKey,
        systemInstruction,
        { ...this.config.settings, temperature: 0.7 },
        onStreamCallback,
        signal,
        {
          history: currentHistory,
          agentMode: 'chat',
          tools: NYX_TOOLS,
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

        currentHistory.push({
          role: 'assistant',
          content: response.text || 'Calling tools...',
          timestamp: Date.now(),
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

          const result = await executeTool(
            call.function.name,
            args,
            '', // No workspace path for chat generally
            signal
          );

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
          role: 'user',
          content: JSON.stringify({ functionResponses: toolResponses }),
          timestamp: Date.now(),
        });
      } else {
        yield* this.emitThinking('Task complete.', reasoningChain);
        break;
      }
    }
  }
}
