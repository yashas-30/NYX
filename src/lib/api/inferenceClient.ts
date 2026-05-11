// All Gemini calls route through the local Express server proxy (/api/gemini/stream)
// so the server can reuse a persistent HTTP/2 connection to Google's API.

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export async function callAI(
  modelId: string,
  provider: string,
  prompt: string,
  apiKey?: string,
  systemInstruction?: string,
  settings?: AISettings,
  onStream?: (text: string) => void,
  retryCount = 0,
  signal?: AbortSignal,
  nodeId?: string,
  options?: { lmStudioBaseUrl?: string; ollamaBaseUrl?: string; history?: any[] }
): Promise<{ text: string; latency: number; ttft?: number }> {
  const startTime = Date.now();

  // ── Strict API Key Validation ───────────────────────────────────────────
  if (apiKey) {
    const key = apiKey.trim();
    if (provider === 'openrouter' && !key.startsWith('sk-or-')) {
      throw new Error("Invalid OpenRouter API Key format (must start with 'sk-or-')");
    }
    if (provider === 'gemini' && key.length < 30) {
      throw new Error("Invalid Gemini API Key format (too short)");
    }
  }

  try {
    let resultText = "";
    let ttft: number | undefined;

    if (provider === 'gemini') {
      // ── Route through local server proxy for persistent HTTP/2 connection ──
      // The server caches GoogleGenAI instances per key, eliminating the
      // TLS handshake overhead on every request (~200-800ms savings).
      if (!apiKey) throw new Error("Gemini API key is required. Add it in Settings.");

      const response = await fetch('/api/gemini/stream', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive' 
        },
        body: JSON.stringify({ model: modelId, prompt, apiKey, settings, systemInstruction, history: options?.history }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error || `Request failed: ${response.status}`);
      }
      if (!response.body) throw new Error("No response body from Gemini proxy");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk && onStream) {
              resultText += parsed.chunk;
              onStream(resultText);
            }
            if (parsed.done) {
              // Final check
            }
          } catch (parseErr: any) {
            if (!parseErr.message?.includes("JSON")) throw parseErr;
          }
        }
      }

      if (!resultText || resultText.includes('[PROTOCOL HALT]')) {
        throw new Error(resultText || "No response received from API. The service may be unavailable or the request timed out.");
      }

    } else if (provider === 'ollama') {

      // ── Ollama (direct browser→Ollama — zero Express hop) ─────────────────
      // ollamaClient handles abort, pre-warm, and unload. This wrapper adapts
      // the callback-based client to the Promise-based callAI interface.
      const { ollamaChat } = await import('./ollamaClient');

      await new Promise<void>((resolve, reject) => {
        ollamaChat({
          nodeId: nodeId ?? modelId,
          model: modelId,
          prompt,
          systemInstruction,
          baseUrl: options?.ollamaBaseUrl,
          settings,
          onChunk: (_chunk, accumulated) => {
            resultText = accumulated;
            if (onStream) onStream(accumulated);
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
          history: options?.history
        });

        // Propagate external abort signal to ollamaClient
        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }
      });

      if (!resultText) throw new Error("Ollama returned no response. Check if Ollama is running.");

    } else if (provider === 'openrouter') {

      // ── OpenRouter (via server-side SSE proxy) ─────────────────────────────
      if (!apiKey) throw new Error("OpenRouter API key is required. Add it in Settings.");

      const endpoint = `/api/openrouter/stream`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        },
        body: JSON.stringify({ model: modelId, prompt, apiKey, settings, systemInstruction, history: options?.history }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error((err as any).error || `Request failed: ${response.status}`);
      }
      if (!response.body) throw new Error("No response body from OpenRouter proxy");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk && onStream) {
              resultText += parsed.chunk;
              onStream(resultText);
            }
            if (parsed.done) {
              // End
            }
          } catch (parseErr: any) {
            if (!parseErr.message?.includes("JSON")) throw parseErr;
          }
        }
      }

      if (!resultText) throw new Error("OpenRouter returned no response. Check your API key and try again.");

    } else if (provider === 'nvidia') {
      // ── NVIDIA (via server-side SSE proxy) ─────────────────────────────────
      if (!apiKey) throw new Error("NVIDIA API key is required. Add it in Settings.");

      const response = await fetch('/api/nvidia/stream', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        },
        body: JSON.stringify({ model: modelId, prompt, apiKey, settings, systemInstruction, history: options?.history }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error((err as any).error || `Request failed: ${response.status}`);
      }
      if (!response.body) throw new Error("No response body from NVIDIA proxy");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk && onStream) {
              resultText += parsed.chunk;
              onStream(resultText);
            }
          } catch (parseErr: any) {
            if (!parseErr.message?.includes("JSON")) throw parseErr;
          }
        }
      }

      if (!resultText) throw new Error("NVIDIA NIM returned no response. Check your API key and try again.");

    } else if (provider === 'opencode') {
      // ── OpenCode (Free models, no key required) ───────────────────────────
      const response = await fetch('/api/opencode/stream', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        },
        body: JSON.stringify({ model: modelId, prompt, settings, systemInstruction, history: options?.history }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error((err as any).error || `Request failed: ${response.status}`);
      }
      if (!response.body) throw new Error("No response body from OpenCode proxy");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk && onStream) {
              resultText += parsed.chunk;
              onStream(resultText);
            }
          } catch { }
        }
      }

    } else if (provider === 'lmstudio') {
      // ── LM Studio (direct browser→LM Studio — zero Express hop) ───────────
      const { lmStudioChat } = await import('./lmStudioClient');

      await new Promise<void>((resolve, reject) => {
        lmStudioChat({
          nodeId: nodeId ?? modelId,
          model: modelId,
          prompt,
          systemInstruction,
          baseUrl: options?.lmStudioBaseUrl,
          settings,
          onChunk: (_chunk, accumulated) => {
            resultText = accumulated;
            if (onStream) onStream(accumulated);
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
          history: options?.history
        });

        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }
      });

      if (!resultText) throw new Error("LM Studio returned no response. Check if LM Studio is running.");

    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const endTime = Date.now();
    return {
      text: resultText,
      latency: endTime - startTime,
    };
  } catch (error: any) {
    const message = error.message || String(error);

    // Handle transient errors (rate limit, quota, overloaded) — retry up to 2x
    const isTransient =
      message.includes("429") ||
      message.includes("503") ||
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("UNAVAILABLE") ||
      message.includes("rate_limit") ||
      message.includes("quota") ||
      message.includes("overloaded") ||
      message.includes("high demand");

    if (isTransient && retryCount < 2) {
      const waitTime = (retryCount + 1) * 4000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return callAI(modelId, provider, prompt, apiKey, systemInstruction, settings, onStream, retryCount + 1, signal, nodeId, options);
    }

    console.error(`Error calling ${provider} model ${modelId}:`, error);

    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429") || message.includes("quota")) {
      throw new Error("API quota exceeded. Your provider has reached its usage limit. Check your provider dashboard.");
    }

    if (message.includes("503") || message.includes("UNAVAILABLE") || message.includes("high demand") || message.includes("overloaded")) {
      throw new Error("Model is currently unavailable or overloaded. Please try again in a moment or use a different model.");
    }

    if (message.includes("No response received") || message.includes("PROTOCOL HALT") || message.includes("No response body")) {
      throw new Error("No response from API. The service may be down or unreachable. Try a different provider or model.");
    }

    throw new Error(message);
  }
}

/** Returns true if the prompt is asking for code to be written. */
export function isCodePrompt(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return [
    'write', 'code', 'implement', 'function', 'class', 'algorithm', 'script',
    'program', 'method', 'api', 'component', 'module', 'build', 'create a',
    'develop', 'generate code', 'snippet', 'solve', 'debug', 'refactor', 'optimize'
  ].some(kw => p.includes(kw)) || prompt.trim().startsWith('CODE: ');
}
