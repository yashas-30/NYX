import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { runTauriAgentLoop, runAgentLoop } from './agentLoop';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';

export interface ChatAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
}

export class ChatAgent extends BaseAgent<ChatAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    const isTauriEnv = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    
    const systemInstruction = `You are the NYX Chat Agent, a highly intelligent conversational assistant.
Your primary role is to answer user queries accurately, empathetically, and concisely.
You have access to a specific set of tools: web_search, browser_read_page, read_file, and store_memory.

CRITICAL INSTRUCTIONS:
1. If the user asks about facts, recent events, or information outside your training data, you MUST use the web_search tool.
2. If you need to read an article, documentation, or explore a URL returned by a web search, use the browser_read_page tool.
3. Maintain conversational flow but prioritize factual accuracy.
4. If the user asks you to remember something, use the store_memory tool.
5. Keep answers relatively concise unless asked for a detailed explanation.

WEB SEARCH CITATIONS:
- When using the web_search tool, cite your sources in the text using standard [1], [2] brackets referencing the result number (e.g. "According to research [1]...").

ARTIFACT GENERATION:
- If you are generating a self-contained document, webpage, interactive component, code file, diagram, or data visualization that the user is likely to reuse or interact with, you MUST wrap it inside a custom XML artifact tag:
<nyx_artifact id="unique-id" title="Descriptive Title" type="html" language="html">
... content here ...
</nyx_artifact>
- Valid types: html, react, mermaid, python, code.
- If type is "react", use language "tsx". If type is "html", use language "html". If type is "mermaid", use language "mermaid".
- The content inside the artifact should be fully functional, clean, and self-contained.
- Do not output raw HTML/JS/CSS unless wrapped in an artifact.
` + (this.config.systemPromptAddon ? `\n\nADDITIONAL INSTRUCTIONS:\n${this.config.systemPromptAddon}` : '');

    const loopConfig = {
      modelId: this.config.modelId,
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      settings: this.config.settings,
      systemInstruction,
      history: this.config.history,
      maxIterations: 5, // Chat usually requires fewer iterations
      signal,
      agentType: 'chat'
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
