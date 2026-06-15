import { ChatMessage, StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { io, Socket } from 'socket.io-client';
import { getOrFetchSessionToken } from '@src/infrastructure/api/authFetch';
import { runAgentLoop, BUILTIN_TOOLS } from './agentLoop';
import { MemoryStore } from './memoryStore';
import { Store } from '@tauri-apps/plugin-store';

const settingsStore = new Store('nyx_settings.bin');

export interface ChatAgentConfig extends BaseAgentConfig {
  updateHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  agentType?: string;
  enableAgentLoop?: boolean;
}

// ── Fix 4: Persistent Socket.IO connection pool ───────────────────────────────
// Instead of creating a new socket per message (100-300ms handshake overhead),
// we maintain one persistent socket per backend URL and reuse it.
interface PooledSocket {
  socket: Socket;
  url: string;
  refCount: number;
  lastUsed: number;
}

const socketPool = new Map<string, PooledSocket>();
const POOL_IDLE_TTL_MS = 5 * 60 * 1000; // release socket after 5 min idle

// Periodic idle connection cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of socketPool.entries()) {
    if (entry.refCount === 0 && now - entry.lastUsed > POOL_IDLE_TTL_MS) {
      entry.socket.disconnect();
      socketPool.delete(key);
    }
  }
}, 60_000);

async function acquireSocket(baseUrl: string): Promise<Socket> {
  const existing = socketPool.get(baseUrl);
  if (existing && existing.socket.connected) {
    existing.refCount++;
    existing.lastUsed = Date.now();
    return existing.socket;
  }

  // Create a new persistent socket
  const token = await getOrFetchSessionToken(true).catch(() => '');
  const socket = io(`${baseUrl}/ai`, {
    path: '/ws/socket.io',
    auth: { token },
    // Prefer WebSocket — skip the long-polling upgrade handshake
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 10_000,
  });

  // Update auth token on reconnect (session may have rotated)
  socket.on('connect', async () => {
    try {
      const freshToken = await getOrFetchSessionToken(true);
      (socket.auth as Record<string, string>).token = freshToken;
    } catch {
      // token refresh failed — keep existing token
    }
  });

  socketPool.set(baseUrl, { socket, url: baseUrl, refCount: 1, lastUsed: Date.now() });
  return socket;
}

function releaseSocket(baseUrl: string): void {
  const entry = socketPool.get(baseUrl);
  if (entry) {
    entry.refCount = Math.max(0, entry.refCount - 1);
    entry.lastUsed = Date.now();
  }
}

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
    const modelCustomPrompts = await settingsStore.get<Record<string, string>>('modelSystemPrompts') || {};
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

    if (searchContextPromise) {
      const searchContext = await searchContextPromise;
      if (searchContext) {
        processedHistory.push({
          role: 'user',
          content: `Web Search Context: ${searchContext}`,
          timestamp: Date.now(),
        });
      }
    }

    // Fix 10: Delegate to Agent Loop if enabled
    if (this.config.enableToolLoop) {
      yield* runAgentLoop(prompt, {
        modelId: this.config.modelId,
        provider: this.config.provider,
        apiKey: this.config.apiKey || '',
        settings: this.config.settings,
        history: processedHistory,
        tools: this.config.tools || BUILTIN_TOOLS,
        signal,
      });
      return;
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

    // Fix 4: use pooled persistent socket instead of creating a new one per message
    let socket: Socket;
    try {
      socket = await acquireSocket(base);
    } catch (err: any) {
      yield { type: 'error', content: `Failed to connect: ${err.message}` };
      return;
    }

    // Unique request ID to namespace events on a shared socket
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const onChunk = (data: any) => {
      // Filter to only events for this request
      if (data.requestId && data.requestId !== requestId) return;

      if (data.done) {
        isDone = true;
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
        return;
      }

      if (typeof data.text === 'string' && data.text) {
        push({ type: 'text', content: data.text });
      } else if (data.chunk) {
        push({ type: 'text', content: data.chunk });
      } else if (data.type) {
        push(data as StreamEvent);
      }
    };

    const onConnectError = (err: Error) => {
      error = err;
      isDone = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const onDisconnect = () => {
      isDone = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    socket.on('stream-chunk', onChunk);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);

    // Emit the request with the requestId so the server can tag responses
    socket.emit('stream-request', {
      requestId,
      modelId: this.config.modelId,
      provider: this.config.provider,
      prompt,
      history: processedHistory,
      settings: this.config.settings,
      agentType: this.config.agentType || 'chat',
    });

    // Abort signal handler — detach listeners and mark done
    const onAbort = () => {
      isDone = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
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
      // Detach listeners so shared socket doesn't accumulate handlers
      socket.off('stream-chunk', onChunk);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      signal.removeEventListener('abort', onAbort);
      releaseSocket(base);
    }
  }
}
