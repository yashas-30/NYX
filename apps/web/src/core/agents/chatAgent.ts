import { ChatMessage, StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { getOrFetchSessionToken } from '@src/infrastructure/api/authFetch';
import { MemoryStore } from './memoryStore';
import { LazyStore as Store } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

const isTauriEnv = !!(window as any).__TAURI_INTERNALS__;

const settingsStore = new Store('nyx_settings.bin');

export interface ChatAgentConfig extends BaseAgentConfig {
  updateHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  agentType?: string;
  enableAgentLoop?: boolean;
}

// ── Fix 4: Fallback Fetch Logic ───────────────────────────────
// We use Tauri IPC native stream whenever possible.
// This file is simplified because the full Agent Loop has been moved to Rust.

// ── ChatAgent ─────────────────────────────────────────────────────────────────

export class ChatAgent extends BaseAgent<ChatAgentConfig, StreamEvent> {
  shouldSearchWeb(prompt: string, analysis: PromptAnalysis): boolean {
    if (analysis?.intent === 'web_search') return true;

    const lower = prompt.toLowerCase();

    // Traffic Controller & Token Optimizer Rules (Local Regex triggers)
    // 1. Temporal Gaps & News
    const temporalKeywords = [
      'current news',
      'latest release',
      'breaking news',
      'recent events',
      'today',
      'now',
      'recently',
      'newest',
      'latest',
      'current',
    ];
    const infoKeywords = [
      'price',
      'weather',
      'status',
      'news',
      'release',
      'update',
      'version',
      'score',
      'match',
      'event',
    ];

    // Check for explicit temporal/live requests
    if (lower.includes('live') || lower.includes('real-time') || lower.includes('realtime'))
      return true;

    // Check for status requests
    if (
      lower.includes('is currently') ||
      lower.includes('what is the current') ||
      lower.includes('who is currently')
    )
      return true;

    // Check combinations that strongly imply real-time or recent need
    const hasTemporal =
      temporalKeywords.some((k) => lower.includes(k)) || /(2025|2026|2027)/.test(lower);
    const hasInfo = infoKeywords.some((k) => lower.includes(k));

    if (hasTemporal && hasInfo) {
      return true;
    }

    // Default to false (save tokens, do not search for every prompt)
    return false;
  }

  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: { name: string; mimeType: string; data: string }[]
  ): AsyncGenerator<StreamEvent> {
    const reasoningChain: string[] = [];
    if (searchContextPromise) {
      yield* this.emitThinking('Searching the web and analyzing context...', reasoningChain);
    } else {
      yield* this.emitThinking('Connecting to backend agent service...', reasoningChain);
    }

    /**
     * Token-budget history slicing.
     * Walk backwards through history and include messages until we approach
     * the budget. Uses a 4 chars/token heuristic (~±15% accuracy for English).
     * This prevents context-overflow errors on long conversations without
     * arbitrarily cutting recent messages based on count.
     */
    const MAX_HISTORY_TOKENS = 80_000; // leave headroom for system prompt + new turn
    const CHARS_PER_TOKEN = 4;

    let processedHistory = [...this.config.history];
    let tokenCount = 0;
    let sliceFrom = processedHistory.length;

    for (let i = processedHistory.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil((processedHistory[i].content?.length ?? 0) / CHARS_PER_TOKEN);
      if (tokenCount + msgTokens > MAX_HISTORY_TOKENS) break;
      tokenCount += msgTokens;
      sliceFrom = i;
    }

    if (sliceFrom > 0) {
      processedHistory = processedHistory.slice(sliceFrom);
    }

    // Fix 13 & 15: Inject Memory and Per-Model Custom Prompts
    const memoryPrompt = await MemoryStore.getMemoryPrompt();
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    let modelCustomPrompts: Record<string, string> = {};
    if (isTauri) {
      try {
        modelCustomPrompts = await settingsStore.get<Record<string, string>>('modelSystemPrompts') || {};
      } catch (e) {
        console.warn('Failed to load custom prompts from store', e);
      }
    } else {
      const stored = localStorage.getItem('nyx_model_prompts');
      if (stored) {
        try {
          modelCustomPrompts = JSON.parse(stored);
        } catch (e) {}
      }
    }

    const customPrompt = modelCustomPrompts[this.config.modelId] || '';

    let systemInstructions = '';
    if (customPrompt) systemInstructions += `${customPrompt}\n\n`;
    if (memoryPrompt) systemInstructions += `${memoryPrompt}\n\n`;

    if (systemInstructions) {
      processedHistory.unshift({
        role: 'system',
        content: systemInstructions.trim(),
        timestamp: Date.now()
      });
    }

    const queue: StreamEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let isDone = false;
    let error: Error | null = null;

    const push = (event: StreamEvent) => {
      queue.push(event);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const base = (window as any).__NYX_BACKEND_URL__ || '';

    const searchContext = await (searchContextPromise || Promise.resolve(''));
    
    if (searchContext) {
      processedHistory.push({
        role: 'user',
        content: `Web Search Context: ${searchContext}`,
        timestamp: Date.now(),
      });
    }

    // Tauri Native Agent execution:
    // Rust now handles the multi-turn Tool Agent loop natively.
    yield* this.streamTauriResponse(prompt, processedHistory, signal);
    return;
  }

  private async *streamTauriResponse(
    prompt: string,
    history: ChatMessage[],
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const queue: StreamEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let isDone = false;
    let error: Error | null = null;

    const push = (event: StreamEvent) => {
      queue.push(event);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const eventName = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let unlisten: UnlistenFn | null = null;

    try {
      unlisten = await listen<any>(eventName, (event) => {
        const payload = event.payload;
        if (payload.error) {
          error = new Error(payload.error);
          isDone = true;
          if (resolveNext) resolveNext();
          return;
        }

        if (payload.done || payload.type === 'done') {
          isDone = true;
          if (resolveNext) resolveNext();
          return;
        }

        if (payload.type) {
           push(payload as StreamEvent);
        } else if (payload.chunk) {
           push({ type: 'text', content: payload.chunk });
        }
      });

      const req = {
        provider: this.config.provider,
        model_id: this.config.modelId,
        messages: history.map(m => ({ role: m.role, content: m.content || '' })),
        api_key: this.config.apiKey || '',
        temperature: this.config.settings?.temperature ?? 0.7,
        max_tokens: this.config.settings?.maxTokens,
        event_name: eventName,
      };
      
      req.messages.push({ role: 'user', content: prompt });

      let invokeCmd = 'llm_stream_request';
      let invokeArgs: any = { req };
      
      if (this.config.enableAgentLoop) {
        invokeCmd = 'orchestrate_supervisor';
        invokeArgs = {
          messages: req.messages,
          context: {
            request_id: eventName,
            session_id: 'chat_session',
            provider: this.config.provider,
            model: this.config.modelId,
            api_key: this.config.apiKey || '',
          },
          event_name: eventName,
        };
      }
      
      // Trigger the Tauri native backend
      invoke(invokeCmd, invokeArgs).catch((err) => {
        error = new Error(err.toString());
        isDone = true;
        if (resolveNext) resolveNext();
      });

      const onAbort = () => {
        isDone = true;
        if (resolveNext) resolveNext();
      };
      signal.addEventListener('abort', onAbort, { once: true });

      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (isDone) {
          if (error) throw error;
          break;
        } else if (signal.aborted) {
          break;
        } else {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
    } finally {
      if (unlisten) unlisten();
    }
  }
}
