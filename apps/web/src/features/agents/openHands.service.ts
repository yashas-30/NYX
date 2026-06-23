import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PromptAnalysis } from '@src/features/ai/services/promptClassifier';

export class NativeAgentService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private history: any[] = [];

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  private buildMemoryContext(prompt: string): string {
    return `[SYSTEM STATE]\n${JSON.stringify(this.history)}\n\n[USER_QUERY]\n${prompt}`;
  }

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    systemPromptAddon: string,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: { name: string; mimeType: string; data: string; }[]
  ): AsyncGenerator<any> {
    
    let isDone = false;
    let resolveNext: (() => void) | null = null;
    const queue: any[] = [];

    const onEvent = (event: any) => {
      queue.push(event);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const unlisten = await listen('agent-stream', (event) => {
      const payload: any = event.payload;
      if (payload.type === 'done' || payload.type === 'error') {
        isDone = true;
        onEvent(payload);
      } else {
        onEvent(payload);
      }
    });

    try {
      const defaultSystemPrompt = `
You are a highly capable AI agent, modeled after OpenHands.
Your goal is to solve the user's tasks accurately and efficiently.

<ROLE>
- You are a methodical problem solver.
- You think step-by-step before taking actions.
- You use tools to gather information (search, read files, scrape) and to execute commands.
</ROLE>

<OUTPUT_STRUCTURE>
When you need to output modified files or write extensive code to the user, you MUST format it as a rich artifact.
Use the following exact syntax:
<nyx_artifact id="unique-id" title="File Name or Component" type="language (e.g. react, python, html)">
// Code goes here
</nyx_artifact>

For simple text responses, use standard markdown.
Always wrap inline code in \`backticks\` and block code in triple backticks.
</OUTPUT_STRUCTURE>

<TOOL_USAGE>
- Use "search_web" for online research.
- Use "scrape_url" to read specific online documentation or articles.
- Use "search_rag" to semantically search the local codebase.
- Use "read_file" to inspect specific local files.
- Use "execute_bash" for running shell commands.
</TOOL_USAGE>
`;

      invoke('start_native_agent', {
        req: {
          prompt: this.buildMemoryContext(prompt),
          api_key: this.apiKey,
          base_url: this.baseUrl,
          model: this.model,
          system_prompt: systemPromptAddon || defaultSystemPrompt,
        }
      }).catch(err => {
        isDone = true;
        onEvent({ type: 'error', error: err });
      });

      while (!isDone || queue.length > 0) {
        if (queue.length > 0) {
          const item = queue.shift();
          if (item.type === 'done') break;
          yield item;
        } else {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
    } finally {
      unlisten();
    }
  }
}
