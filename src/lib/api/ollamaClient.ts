// ─── src/lib/api/ollamaClient.ts ──────────────────────────────────────────────
// ALL Ollama logic lives here. To change Ollama behaviour, edit only this file.
//
// Design goals:
//  1. ZERO latency on model switch — old model aborted + unloaded instantly
//  2. New model pre-warmed the moment it is selected in the UI
//  3. Direct browser → Ollama (no Express hop for chat — saves ~5-15ms RTT)
//  4. Falls back to Express proxy if Ollama CORS blocks (shouldn't on localhost)
//  5. Per-node AbortController — each card stream is independent

const OLLAMA_DIRECT = 'http://127.0.0.1:11434'; // direct, zero-hop
const OLLAMA_PROXY = '/api/ollama';             // Express proxy fallback

// ── Active streams ─────────────────────────────────────────────────────────────
// Keyed by nodeId. Calling abort() on a controller immediately kills the fetch.
const nodeControllers = new Map<string, AbortController>();

// ── Pre-warmed models ──────────────────────────────────────────────────────────
// Tracks which models are resident in VRAM so we don't double-warm.
const warmedModels = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called the instant a user selects a model in the UI.
 * Fires the unload of the old model + pre-warm of the new model in parallel.
 * Zero UI blocking — both calls are fire-and-forget.
 *
 * @param nodeId      The card/node ID the model is assigned to
 * @param prevModel   The model that was running before (will be unloaded)
 * @param nextModel   The model being switched to (will be pre-warmed)
 */
export function onModelSwitch(nodeId: string, prevModel: string | undefined, nextModel: string): void {
  // 1. Immediately abort any in-flight stream on this node
  abortNodeStream(nodeId);

  // 2. Unload previous model from VRAM (fire-and-forget, ~0ms UI impact)
  if (prevModel && prevModel !== nextModel) {
    warmedModels.delete(prevModel);
    _unloadModel(prevModel);
  }

  // 3. Pre-warm the new model so the first prompt has near-zero cold-start
  if (!warmedModels.has(nextModel)) {
    _preWarm(nextModel);
  }
}

/**
 * Force-unload a specific model from VRAM. Called when a node is REMOVED.
 * Uses the Express proxy (reliable, no CORS issues) as the primary path.
 */
export function forceUnload(model: string): void {
  warmedModels.delete(model);
  _unloadModel(model);
}

/**
 * Unload ALL warmed models. Called when the arena is cleared.
 */
export function unloadAll(modelIds: string[]): void {
  for (const model of modelIds) {
    warmedModels.delete(model);
    _unloadModel(model);
  }
  warmedModels.clear();
}

/**
 * Stream a chat response from Ollama directly.
 * Aborts any existing stream on this nodeId before starting.
 *
 * @returns a cleanup function that cancels the stream
 */
export async function ollamaChat(opts: {
  nodeId: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  settings?: { temperature?: number; topP?: number; topK?: number; maxTokens?: number };
  onChunk: (text: string, accumulated: string) => void;
  onDone: (latency: number) => void;
  onError: (msg: string) => void;
  history?: any[];
  baseUrl?: string;
}): Promise<() => void> {
  const { nodeId, model, prompt, systemInstruction, settings, onChunk, onDone, onError, history, baseUrl } = opts;

  // Cancel any existing stream for this node
  abortNodeStream(nodeId);

  const controller = new AbortController();
  nodeControllers.set(nodeId, controller);
  const startTime = Date.now();

  // Run async without blocking the caller
  (async () => {
    try {
      // If we have history, use /api/chat for stateful conversation
      // Otherwise use /api/generate for single prompt
      const useChat = history && history.length > 0;
      const endpoint = useChat ? '/api/chat' : '/api/generate';
      
      const messages = useChat ? [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt }
      ] : undefined;

      const targetBaseUrl = baseUrl || OLLAMA_DIRECT;

      // Try direct first (fastest path, no Express hop)
      const response = await fetch(`${targetBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: useChat ? undefined : prompt,
          messages,
          system: useChat ? undefined : systemInstruction,
          stream: true,
          options: {
            temperature: settings?.temperature,
            top_p: settings?.topP,
            top_k: settings?.topK,
            num_predict: settings?.maxTokens ?? 2048,
            num_thread: 8,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }

      let accumulated = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.error) throw new Error(parsed.error);
            
            // /api/generate uses 'response', /api/chat uses 'message.content'
            const chunk = parsed.response || parsed.message?.content;
            
            if (chunk) {
              accumulated += chunk;
              onChunk(chunk, accumulated);
            }
            if (parsed.done) {
              onDone(Date.now() - startTime);
              return;
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
      onDone(Date.now() - startTime);

    } catch (e: any) {
      if (e.name === 'AbortError') return; // Clean cancel — not an error
      let msg = e.message ?? String(e);
      if (msg.includes('CUDA')) msg = 'GPU VRAM limit reached. Try a smaller model.';
      if (msg.includes('Failed to fetch')) {
        // CORS blocked direct path — fall back to Express proxy
        _chatViaProxy(nodeId, model, prompt, systemInstruction, settings, onChunk, onDone, onError, startTime, controller.signal, history);
        return;
      }
      onError(msg);
    } finally {
      nodeControllers.delete(nodeId);
    }
  })();

  return () => abortNodeStream(nodeId);
}

/**
 * Fetch the list of locally available models.
 */
export async function fetchOllamaModels(baseUrl?: string): Promise<{ name: string; size?: number }[]> {
  const targetBaseUrl = baseUrl || OLLAMA_DIRECT;
  try {
    const r = await fetch(`${targetBaseUrl}/api/tags`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data.models ?? [];
  } catch {
    // Fallback to proxy
    try {
      const r = await fetch(`${OLLAMA_PROXY}/models`);
      const data = await r.json();
      return data.models ?? [];
    } catch {
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function abortNodeStream(nodeId: string): void {
  const existing = nodeControllers.get(nodeId);
  if (existing) {
    existing.abort();
    nodeControllers.delete(nodeId);
  }
}

/**
 * Pre-warm: send a zero-token generate to pull the model into VRAM.
 * Called immediately when a model is selected — runs in the background.
 */
async function _preWarm(model: string): Promise<void> {
  try {
    warmedModels.add(model);
    await fetch(`${OLLAMA_DIRECT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '10m' }),
    });
  } catch {
    warmedModels.delete(model); // Remove from set so it retries on next chat
  }
}

/**
 * Unload: evict model from VRAM immediately.
 * Tries the Express proxy FIRST (guaranteed no CORS issues), then direct.
 * Called the instant a model is removed or switched away.
 */
function _unloadModel(model: string): void {
  // Model unloaded successfully

  // Primary path: Express proxy (reliable, no CORS)
  fetch(`${OLLAMA_PROXY}/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  }).catch(() => {
    // Fallback: direct (may be CORS-blocked but try anyway)
    fetch(`${OLLAMA_DIRECT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0, stream: false }),
    }).catch(() => {
      console.warn(`[OllamaClient] Failed to unload ${model} via both proxy and direct`);
    });
  });
}

/**
 * Fallback chat via Express proxy (used when direct fetch is CORS-blocked).
 */
async function _chatViaProxy(
  nodeId: string,
  model: string,
  prompt: string,
  systemInstruction: string | undefined,
  settings: any,
  onChunk: (t: string, acc: string) => void,
  onDone: (latency: number) => void,
  onError: (msg: string) => void,
  startTime: number,
  signal: AbortSignal,
  history?: any[]
): Promise<void> {
  try {
    const r = await fetch(`${OLLAMA_PROXY}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system: systemInstruction, options: settings, nodeId, history }),
      signal,
    });
    if (!r.ok || !r.body) throw new Error(`Proxy HTTP ${r.status}`);

    let accumulated = '';
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const p = JSON.parse(line.slice(6));
          if (p.error) throw new Error(p.error);
          if (p.response) { accumulated += p.response; onChunk(p.response, accumulated); }
          if (p.done) { onDone(Date.now() - startTime); return; }
        } catch (e: any) {
          if (!e.message?.includes('JSON')) throw e;
        }
      }
    }
    onDone(Date.now() - startTime);
  } catch (e: any) {
    if (e.name !== 'AbortError') onError(e.message ?? String(e));
  }
}
