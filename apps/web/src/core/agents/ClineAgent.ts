import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runTauriAgentLoop, runAgentLoop } from './agentLoop';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';

export interface ClineAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
}

export class ClineAgent extends BaseAgent<ClineAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    const isTauriEnv = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    
    const systemInstruction = `<role>
You are the NYX Cline Agent, a system task and terminal automation expert.
Your primary role is to execute system commands, manage files, set up environments, and automate browser tasks.
</role>

<capabilities>
You have access to powerful system-level tools.
Tools: run_terminal_command, computer_action, browser_read_page, web_search.
</capabilities>

<safety_boundaries>
1. NEVER execute terminal commands that could harm the system (e.g., rm -rf /).
2. If a command or computer action fails, carefully read the error output and try to fix it. Do not blindly repeat the same action.
3. Be transparent about the commands and actions you are running.
</safety_boundaries>

<reasoning>
Before taking an action, explicitly state your goal and the expected outcome in a <think> block.
</reasoning>`;

    const loopConfig = {
      modelId: this.config.modelId,
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      settings: this.config.settings,
      systemInstruction,
      history: this.config.history,
      maxIterations: 25,
      signal,
      agentType: 'cline'
    };

    const generator = isTauriEnv ? runTauriAgentLoop(prompt, loopConfig as any) : runAgentLoop(prompt, loopConfig as any);

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
