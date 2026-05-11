// ─── src/lib/api/lmStudioClient.ts ──────────────────────────────────────────────
// LM Studio integration proxy client. 
// Uses the backend /api/lmstudio routes to bypass browser CORS restrictions.
//
// Key design: models are loaded on demand and stay loaded until explicitly
// removed from the dashboard. We NEVER speculatively unload models.

import { LMStudioModel } from '@/src/types';

const DEFAULT_LMSTUDIO = 'http://localhost:1234';

const nodeControllers = new Map<string, AbortController>();

// Track loading promises so we don't load the same model multiple times concurrently
const loadingPromises = new Map<string, Promise<void>>();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function onModelSwitchLMStudio(
  prevModel: string | undefined,
  nextModel: string | undefined,
  baseUrl?: string
): void {
  if (prevModel === nextModel) return;

  // We must ensure the previous model is fully unloaded before attempting to load the next one,
  // otherwise LM Studio might reject the load request due to insufficient VRAM.
  let sequence = Promise.resolve();

  if (prevModel) {
    sequence = sequence.then(() => _unloadModel(prevModel, baseUrl));
  }

  if (nextModel) {
    // If this exact model is already in the process of loading, don't queue a second load!
    // This prevents LM Studio from spawning duplicates (like ibm/granite-3.2-8b:2).
    if (!loadingPromises.has(nextModel)) {
      sequence = sequence.then(async () => {
        const success = await _loadModel(nextModel, baseUrl);

        // If the new model completely failed to load (e.g. broken variant),
        // reload the previous model so the user's VRAM state isn't left completely empty unexpectedly.
        if (!success && prevModel) {
          console.warn(`[LMStudioClient] Rollback: reloading ${prevModel} because ${nextModel} failed to load.`);
          await _loadModel(prevModel, baseUrl);
        }
      });

      // Track the load sequence so _unloadModel (and other calls) can wait for it
      const trackedPromise = sequence.finally(() => {
        loadingPromises.delete(nextModel!);
      });
      loadingPromises.set(nextModel, trackedPromise);
    }
  }
}

export function forceUnloadLMStudio(model: string, baseUrl?: string): void {
  _unloadModel(model, baseUrl);
}

export async function ejectAllLMStudio(baseUrl?: string): Promise<void> {
  const url = baseUrl || DEFAULT_LMSTUDIO;
  try {
    const resInstances = await fetch(`/api/lmstudio/instances?baseUrl=${encodeURIComponent(url)}`);
    if (!resInstances.ok) return;

    const data = await resInstances.json();
    if (!data.models) return;

    for (const modelData of data.models) {
      if (modelData.loaded_instances) {
        for (const instance of modelData.loaded_instances) {
          // Ejecting instance...
          fetch('/api/lmstudio/unload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: instance.id, baseUrl: url }),
          }).catch(() => { });
        }
      }
    }
  } catch (e) {
    console.warn('[LMStudioClient] ejectAllLMStudio failed', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function _loadModel(model: string, baseUrl?: string): Promise<boolean> {
  const url = baseUrl || DEFAULT_LMSTUDIO;
  // Loading model...
  try {
    const resInstances = await fetch(`/api/lmstudio/instances?baseUrl=${encodeURIComponent(url)}`);
    if (resInstances.ok) {
      const data = await resInstances.json();
      const isLoaded = data.models?.some((m: any) =>
        m.key === model && m.loaded_instances?.length > 0
      );
      if (isLoaded) {
        // Model already loaded
        return true;
      }
    }

    const res = await fetch('/api/lmstudio/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, baseUrl: url }),
    });
    if (!res.ok) {
      console.warn(`[LMStudioClient] Failed to load ${model}: HTTP ${res.status}`);
      return false;
    } else {
      // Model loaded successfully
      return true;
    }
  } catch (e) {
    console.warn(`[LMStudioClient] Failed to load ${model}`, e);
    return false;
  }
}

async function _unloadModel(model: string, baseUrl?: string): Promise<void> {
  const url = baseUrl || DEFAULT_LMSTUDIO;
  // Unloading model...

  if (loadingPromises.has(model)) {
    // Waiting for model to finish loading before unloading...
    await loadingPromises.get(model);
  }

  try {
    const resInstances = await fetch(`/api/lmstudio/instances?baseUrl=${encodeURIComponent(url)}`);
    if (!resInstances.ok) {
      console.warn(`[LMStudioClient] Cannot fetch instances, skipping unload of ${model}`);
      return;
    }

    const data = await resInstances.json();
    const targetModelData = data.models?.find((m: any) => m.key === model);

    if (!targetModelData?.loaded_instances?.length) {
      // No instances to unload
      return;
    }

    const ejectPromises = targetModelData.loaded_instances.map((instance: any) => {
      // Ejecting instance...
      return fetch('/api/lmstudio/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: instance.id, baseUrl: url }),
      }).catch(() => console.warn(`[LMStudioClient] Failed to unload instance ${instance.id}`));
    });

    await Promise.all(ejectPromises);
  } catch (e) {
    console.warn(`[LMStudioClient] Error during unload of ${model}`, e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH MODELS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch models available in LM Studio via the backend proxy.
 */
export async function fetchLMStudioModels(baseUrl?: string): Promise<LMStudioModel[]> {
  const url = baseUrl || DEFAULT_LMSTUDIO;
  const r = await fetch(`/api/lmstudio/models?baseUrl=${encodeURIComponent(url)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(body?.error || `LM Studio HTTP ${r.status}`);
  }
  const data = await r.json();
  return data.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream a chat response from LM Studio via the backend proxy.
 * The server-side handler ensures the model is loaded before chatting.
 */
export async function lmStudioChat(opts: {
  nodeId: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  baseUrl?: string;
  settings?: { temperature?: number; maxTokens?: number };
  onChunk: (text: string, accumulated: string) => void;
  onDone: (latency: number) => void;
  onError: (msg: string) => void;
  history?: any[];
}): Promise<() => void> {
  const { nodeId, model, prompt, systemInstruction, baseUrl, settings, onChunk, onDone, onError, history } = opts;
  const url = baseUrl || DEFAULT_LMSTUDIO;

  // Abort existing stream for this node
  const existing = nodeControllers.get(nodeId);
  if (existing) {
    existing.abort();
    nodeControllers.delete(nodeId);
  }

  const controller = new AbortController();
  nodeControllers.set(nodeId, controller);
  const startTime = Date.now();

  (async () => {
    try {
      const response = await fetch('/api/lmstudio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          systemInstruction,
          baseUrl: url,
          settings,
          history
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(`LM Studio Proxy HTTP ${response.status}: ${text}`);
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
          const cleanLine = line.trim();
          if (!cleanLine || !cleanLine.startsWith('data: ')) continue;
          try {
            const payload = cleanLine.slice(6);
            if (payload === '[DONE]') continue;
            const parsed = JSON.parse(payload);

            if (parsed.error) {
              const errMsg = typeof parsed.error === 'object'
                ? (parsed.error.message || JSON.stringify(parsed.error))
                : parsed.error;
              throw new Error(errMsg);
            }

            // Server sends { done: true } as end sentinel (forwarded from [DONE])
            if (parsed.done) {
              onDone(Date.now() - startTime);
              return;
            }

            // Server sends { chunk: "..." } — the unified format
            const content = parsed.chunk;
            if (content) {
              accumulated += content;
              onChunk(content, accumulated);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }
      onDone(Date.now() - startTime);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      onError(e.message ?? String(e));
    } finally {
      nodeControllers.delete(nodeId);
    }
  })();

  return () => {
    controller.abort();
    nodeControllers.delete(nodeId);
  };
}
