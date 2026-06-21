import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runLangGraphAgent } from './executeTool';
import { BUILTIN_TOOLS } from './executeTool';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';

export interface OpenCodeAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
}

export class OpenCodeAgent extends BaseAgent<OpenCodeAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    const isTauriEnv = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    
    const systemInstruction = `<role>
You are the NYX OpenCode Agent, a deeply capable Software Engineering Assistant.
Your primary role is to analyze codebase structure, refactor code, write tests, and implement complex features.
</role>

<capabilities>
You have access to a specialized set of filesystem and codebase tools.
Tools: read_file, write_file, list_dir, grep_search, run_terminal_command.
</capabilities>

<code_formatting_rules>
1. Always format code using markdown code blocks.
2. If modifying an existing file, use your tools to do so directly instead of just printing the code to the user.
3. Be precise with your edits. Do not modify unrelated code.
4. When writing code, ALWAYS include necessary imports and dependencies.
</code_formatting_rules>

<behavior>
Before writing any code, thoroughly explore the workspace to understand the context. Use grep_search and list_dir.
Do not make assumptions about the file structure. Read the files first.
Keep your final responses direct and concise. Do NOT use filler phrases like "I am an AI" or "Here is the code".

THINKING PROTOCOL:
- Use <nyx_think>...</nyx_think> blocks to explain your reasoning, planning, or decision-making process before responding to the user.
- These blocks are hidden from the user, allowing you to think freely.
</behavior>

<artifact_generation>
- If you are generating a self-contained document, webpage, interactive component, code file, diagram, or data visualization that the user is likely to reuse or interact with, you MUST wrap it inside a custom XML artifact tag:
<nyx_artifact id="unique-id" title="Descriptive Title" type="code" language="typescript">
... content here ...
</nyx_artifact>
- Valid types: html, react, mermaid, python, code.
- If type is "react", use language "tsx". If type is "html", use language "html". If type is "mermaid", use language "mermaid".
- The content inside the artifact should be fully functional, clean, and self-contained.
</artifact_generation>`;

    const allowedTools = BUILTIN_TOOLS.filter(t => 
      ['read_file', 'write_file', 'list_directory', 'grep_search', 'diff_files', 'run_python', 'lint_code', 'edit_file'].includes(t.name)
    );

    const loopConfig = {
      modelId: this.config.modelId,
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      settings: this.config.settings,
      systemInstruction,
      history: this.config.history,
      maxIterations: 10, // Coding tasks require more iterations for exploration and writing
      signal,
      agentType: 'opencode',
      tools: allowedTools
    };

    let maxCriticLoops = 3;
    let currentLoop = 0;
    let criticPassed = false;
    let currentPrompt = prompt;

    while (currentLoop < maxCriticLoops && !criticPassed && !signal.aborted) {
      currentLoop++;
      let fullOutput = '';
      
      // Update loopConfig dynamically with the new prompt (so critic feedback goes to the loop)
      const currentLoopConfig = { ...loopConfig, systemInstruction: systemInstruction };
      
      const generator = runLangGraphAgent(currentPrompt, currentLoopConfig);

      for await (const event of generator) {
        if (event.type === 'text' && typeof event.content === 'string') {
          fullOutput += event.content;
        }
        yield event as any;
      }

      // ----------------------------------------------------------------------
      // Adversarial Critic Loop Phase
      // ----------------------------------------------------------------------
      yield* this.emitThinking(`Adversarial Critic: Reviewing OpenCodeAgent output (Attempt ${currentLoop}/${maxCriticLoops})...`, []);
      
      try {
        const { AIService } = await import('@src/core/services/ai.service');
        const criticPrompt = `You are the Adversarial Critic Agent.
Review the following output from the OpenCodeAgent.
Your job is to strictly evaluate if the code is correct, follows best practices, and completely satisfies the user's request.

USER REQUEST:
${prompt}

AGENT OUTPUT:
${fullOutput}

If the output is flawless, respond EXACTLY with: PASS
If there are bugs, logic errors, missing imports, or it fails to meet the request, respond with: FAIL
Followed by a concise explanation of what needs to be fixed.`;

        const criticResponse = await AIService.execute(
          this.config.modelId,
          this.config.provider,
          criticPrompt,
          this.config.apiKey,
          undefined,
          this.config.settings,
          undefined,
          signal
        );

        const review = criticResponse.text.trim();
        if (review.startsWith('PASS')) {
          yield* this.emitThinking(`Adversarial Critic: Code passed review.`, []);
          criticPassed = true;
        } else {
          yield* this.emitThinking(`Adversarial Critic: Issues found. Forcing regeneration.`, [review]);
          yield { type: 'text', content: `\n\n> **Critic Review Failed:** ${review.replace('FAIL', '').trim()}\n> Regenerating fixes...\n\n` };
          
          // Append the critic's feedback to the prompt for the next loop
          currentPrompt = `Previous output failed critic review. Please fix the following issues:
${review}

Original request:
${prompt}`;
        }
      } catch (e) {
        console.warn("Critic loop failed to execute, assuming PASS to avoid infinite loop.", e);
        criticPassed = true;
      }
    }
  }
}
