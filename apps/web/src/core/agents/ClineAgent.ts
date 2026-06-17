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
</reasoning>

<artifact_generation>
- If you are generating a self-contained document, webpage, interactive component, code file, diagram, or data visualization that the user is likely to reuse or interact with, you MUST wrap it inside a custom XML artifact tag:
<nyx_artifact id="unique-id" title="Descriptive Title" type="html" language="html">
... content here ...
</nyx_artifact>
- Valid types: html, react, mermaid, python, code.
- If type is "react", use language "tsx". If type is "html", use language "html". If type is "mermaid", use language "mermaid".
- The content inside the artifact should be fully functional, clean, and self-contained.
</artifact_generation>`;

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
        yield {
          type: 'tool_start',
          tool_call: {
            id: event.toolCall?.id,
            name: event.toolCall?.name,
            args: event.toolCall?.arguments
          }
        } as any;
      } else if (event.type === 'tool_running') {
        yield {
          type: 'tool_running',
          name: event.name
        } as any;
      } else if (event.type === 'tool_done') {
        yield {
          type: 'tool_done',
          name: event.name,
          result: event.result
        } as any;
      } else if (event.type === 'tool_error') {
        yield {
          type: 'tool_error',
          name: event.name,
          error: event.error
        } as any;
      } else if (event.type === 'tool_approval_required') {
        yield {
          type: 'tool_approval_required',
          tool: event.name || event.toolCall?.name,
          input: event.toolCall?.arguments,
          approvalId: event.approvalId
        } as any;
      } else if (event.type === 'tool_result') {
        yield* this.emitThinking(`Tool result received.`, [event.content]);
      } else if (event.type === 'text') {
        yield { type: 'text', content: event.content };
      } else if (event.type === 'error') {
        yield { type: 'error', content: event.content };
      } else if (event.type === 'citation') {
        yield { type: 'citation', metadata: (event as any).metadata } as any;
      } else if (event.type === 'artifact') {
        yield { type: 'artifact', metadata: (event as any).metadata } as any;
      }
    }
  }
}
