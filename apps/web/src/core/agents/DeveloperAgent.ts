import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runAgentLoop, AgentLoopEvent } from './agentLoop';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';

export interface DeveloperAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
  agentType?: string;
}

export class DeveloperAgent extends BaseAgent<DeveloperAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    
    // Default to the autonomous loop
    const generator = runAgentLoop(prompt, {
      modelId: this.config.modelId,
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      settings: this.config.settings,
      systemInstruction: `You are an autonomous developer agent. Use your tools to explore the environment, execute code, and verify your solutions. If a command fails, read the error and self-correct. Do not give up immediately.`,
      history: this.config.history,
      maxIterations: 15,
      signal
    });

    for await (const event of generator) {
      if (event.type === 'thinking') {
        yield* this.emitThinking(event.content, []);
      } else if (event.type === 'tool_start') {
        yield* this.emitThinking(`Executing tool: ${event.toolCall?.name}...`, [JSON.stringify(event.toolCall?.arguments)]);
      } else if (event.type === 'tool_result') {
        yield* this.emitThinking(`Tool result received.`, [event.content]);
      } else if (event.type === 'text') {
        yield { type: 'text', content: event.content };
      } else if (event.type === 'error') {
        yield { type: 'error', content: event.content };
      }
    }
  }
}
