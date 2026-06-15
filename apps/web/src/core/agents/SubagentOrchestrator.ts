import { ChatMessage, StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig } from './baseAgent';

export interface OrchestratorConfig extends BaseAgentConfig {
  maxSubagents: number;
}

export class SubagentOrchestrator extends BaseAgent<OrchestratorConfig, StreamEvent> {
  private activeSubagents: Map<string, BaseAgent<any, any>> = new Map();

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    yield* this.emitThinking('Analyzing task to delegate to specialized subagents...', []);

    if (analysis.requiresExecution || analysis.complexity === 'enterprise') {
      yield* this.emitThinking('Delegating to Architect Subagent...', ['Task requires deep planning']);
      // Simulate subagent orchestration
      yield { type: 'text', content: 'Here is the orchestrated response from the Architect and Coder subagents.' };
    } else {
      yield* this.emitThinking('Handling via General Chat Agent...', ['Task is straightforward']);
      yield { type: 'text', content: 'Here is the general response.' };
    }
  }

  // Abort all running subagents
  public abortAll() {
    this.activeSubagents.clear();
  }
}
