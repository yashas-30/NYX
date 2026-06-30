import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PromptAnalysis } from '@src/features/ai/services/promptClassifier';

export class TokioOrchestratorService {
  private apiKey: string;
  private provider: string;
  private model: string;
  private history: any[] = [];
  private sessionId: string;

  constructor(apiKey: string, provider: string, model: string, sessionId: string) {
    this.apiKey = apiKey;
    this.provider = provider;
    this.model = model;
    this.sessionId = sessionId;
  }

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    systemPromptAddon: string,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: { name: string; mimeType: string; data: string; }[]
  ): AsyncGenerator<any> {
    
    const isTauriEnv = typeof window !== 'undefined' && 
      ('__TAURI_INTERNALS__' in window) && 
      (typeof (window as any).__TAURI_INTERNALS__?.transformCallback === 'function' || '__TAURI__' in window);
      
    if (!isTauriEnv) {
      yield { type: 'error', content: 'Native agent service (Tokio Orchestrator) is only available when running inside the NYX Tauri desktop app. Please use the desktop app for local tool execution.' };
      return;
    }
    
    let isDone = false;
    let resolveNext: (() => void) | null = null;
    const queue: any[] = [];
    
    const eventName = `agent-stream-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const onEvent = (event: any) => {
      queue.push(event);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    let unlisten = () => {};
    try {
      unlisten = await listen(eventName, (event) => {
        const payload: any = event.payload;
        if (payload.type === 'done' || payload.type === 'error') {
          isDone = true;
          onEvent(payload);
        } else {
          onEvent(payload);
        }
      });
    } catch (e: any) {
      yield { type: 'error', content: `Native agent service failed to initialize (make sure you are running the desktop app): ${e?.message || String(e)}` };
      return;
    }

    try {
      const defaultSystemPrompt = `
You are a highly capable AI agent orchestrator running via Tokio in NYX.
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
`;

      const context = {
        request_id: crypto.randomUUID(),
        session_id: this.sessionId,
        provider: this.provider,
        model: this.model,
        api_key: this.apiKey,
        max_iterations: 15,
        system_instruction: systemPromptAddon || defaultSystemPrompt,
        agent_type: 'chat',
        is_fast_intent: analysis?.suggestedModel === 'fast'
      };

      const messages = [
         ...this.history,
         { role: 'user', content: prompt }
      ];

      invoke('orchestrate_supervisor', {
        messages,
        context,
        eventName: eventName
      }).then((res) => {
        if (typeof res === 'string') {
          onEvent({ type: 'text', content: res || 'Task executed successfully but no output was returned.' });
        } else if (res) {
          onEvent({ type: 'text', content: JSON.stringify(res, null, 2) });
        }
        onEvent({ type: 'done' });
      }).catch(err => {
        isDone = true;
        onEvent({ type: 'error', error: err });
      });

      signal.addEventListener('abort', () => {
         invoke('cancel_agent_loop').catch(console.error);
         isDone = true;
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
