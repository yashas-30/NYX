import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runAgentLoop, runTauriAgentLoop, AgentLoopEvent } from './agentLoop';
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
    
    const systemInstruction = `You are an autonomous developer agent. Use your tools to explore the environment, execute code, and verify your solutions. If a command fails, read the error and self-correct. Do not give up immediately. Note: If any previous assistant message in the history ends with '[Response interrupted by user]', it was aborted. Ignore that partial response, focus strictly on the current task, and do not try to complete or continue the interrupted thought.${
      this.config.webSearchEnabled
        ? '\n\nIMPORTANT: Web search is ENABLED. You MUST proactively use the `web_search` tool for any questions about current events, temporal data (e.g. "latest", "today", "news"), facts, or anything outside your training knowledge. Do not apologize for not knowing something; use the tool to find out.'
        : ''
    }`;

    yield* this.streamFromPythonAPI(prompt, systemInstruction, signal);
  }
}
