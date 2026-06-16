import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runTauriAgentLoop, runAgentLoop, AgentLoopEvent } from './agentLoop';
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
    
    const isTauriEnv = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    
    const loopConfig = {
      modelId: this.config.modelId,
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      settings: this.config.settings,
      systemInstruction: `You are an autonomous developer agent. Use your tools to explore the environment, execute code, and verify your solutions. If a command fails, read the error and self-correct. Do not give up immediately. Note: If any previous assistant message in the history ends with '[Response interrupted by user]', it was aborted. Ignore that partial response, focus strictly on the current task, and do not try to complete or continue the interrupted thought.${
        this.config.webSearchEnabled
          ? '\n\nIMPORTANT: Web search is ENABLED. You MUST proactively use the `web_search` tool for any questions about current events, temporal data (e.g. "latest", "today", "news"), facts, or anything outside your training knowledge. Do not apologize for not knowing something; use the tool to find out.'
          : ''
      }`,
      history: this.config.history,
      maxIterations: this.config.agentType === 'chat' ? 6 : 10,
      signal
    };

    const generator = isTauriEnv ? runTauriAgentLoop(prompt, loopConfig) : runAgentLoop(prompt, loopConfig);

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
