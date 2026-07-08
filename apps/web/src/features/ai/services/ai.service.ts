/**
 * @file src/features/ai/services/ai.service.ts
 * @description Lean AI utility service containing only essential UI-side helpers,
 *   as all heavy lifting, streaming, and execution is now native in the Rust backend.
 */

import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Token counting with tiktoken (cl100k_base)
// ---------------------------------------------------------------------------
let _countTokens: ((text: string) => number) | null = null;

async function initTokenizer(): Promise<void> {
  if (_countTokens) return;
  try {
    const { encoding_for_model } = await import(/* @vite-ignore */ 'tiktoken');
    const enc = encoding_for_model('gpt-4o');
    _countTokens = (text: string) => {
      try {
        return enc.encode(text).length;
      } catch {
        const asciiChars = (text.match(/[\\x00-\\x7F]/g) || []).length;
        return Math.ceil(text.length / 3.5); // Better heuristic for code
      }
    };
  } catch {
    _countTokens = (text: string) => {
      return Math.ceil(text.length / 3.5); // Better heuristic for code
    };
  }
}
initTokenizer().catch(() => {});

export function countTokens(text: string): number {
  if (_countTokens) return _countTokens(text);
  return Math.ceil(text.length / 3.5); // Better heuristic for code
}

// ---------------------------------------------------------------------------
// Per-request abort controllers (not global singleton)
// ---------------------------------------------------------------------------
const activeControllers = new Map<string, { controller: AbortController; timestamp: number }>();

export function cancelRequest(requestId: string): void {
  const data = activeControllers.get(requestId);
  if (data) {
    data.controller.abort();
    activeControllers.delete(requestId);
  }
}

export function cancelAllRequests(): void {
  activeControllers.forEach((data) => data.controller.abort());
  activeControllers.clear();
}

/**
 * Backward compatibility alias for cancelAllRequests
 */
export function cancelCurrentRequest(): void {
  cancelAllRequests();
}

// ---------------------------------------------------------------------------
// AIService
// ---------------------------------------------------------------------------
export class AIService {
  private static cachedVaultStatus: any = null;
  private static cachedVaultStatusTime = 0;
  private static pendingVaultStatusPromise: Promise<any> | null = null;

  // -------------------------------------------------------------------------
  // Vault status with stale-while-revalidate
  // -------------------------------------------------------------------------
  public static async getVaultStatus(): Promise<any> {
    if (this.cachedVaultStatus && Date.now() - this.cachedVaultStatusTime < 2000) {
      return this.cachedVaultStatus;
    }
    if (this.pendingVaultStatusPromise) {
      return this.pendingVaultStatusPromise;
    }
    this.pendingVaultStatusPromise = (async () => {
      try {
        const res: any = await invoke('vault:status');
        if (res.success && res.data) {
          this.cachedVaultStatus = res.data;
          this.cachedVaultStatusTime = Date.now();
          return res.data;
        }
      } catch (e) {
        // vault status is optional
      } finally {
        this.pendingVaultStatusPromise = null;
      }
      return null;
    })();
    return this.pendingVaultStatusPromise;
  }

  public static async checkStatus(provider: string, apiKey: string): Promise<'online' | 'offline' | 'no-key'> {
    if (!apiKey && provider !== 'local') return 'no-key';

    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

    if (!isTauri) {
      // In web-only builds we cannot ping providers — treat key presence as online.
      return apiKey ? 'online' : 'no-key';
    }

    try {
      const result = await invoke<{ reachable: boolean }>(
        'check_provider_reachable',
        { provider, apiKey: apiKey || null }
      );
      return result.reachable ? 'online' : 'offline';
    } catch {
      // IPC not available for this provider yet — degrade gracefully.
      return apiKey ? 'online' : 'no-key';
    }
  }

  static compressPrompt(prompt: string, maxTokens = 100000): string {
    const tokens = countTokens(prompt);
    if (tokens <= maxTokens) return prompt;
    // rough heuristic: 1 token = 3.5 chars
    const maxChars = maxTokens * 3.5;
    return prompt.slice(0, maxChars) + '\n...[TRUNCATED]...';
  }
}

// ---------------------------------------------------------------------------
// Provider-specific defaults
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate max_tokens default for each provider.
 */
export function getDefaultMaxTokens(provider: string): number {
  switch (provider) {
    case 'openrouter':
    case 'gemini':
      return 8_192;
    default:
      return 8_192; // Local models
  }
}

/**
 * Provider-specific characters-per-token ratios for accurate context budgeting.
 */
export function estimateTokens(text: string, provider: string): number {
  const len = text.length;
  switch (provider) {
    case 'gemini':
      return Math.ceil(len / 3.5); // Gemini SentencePiece: ~3.5 chars/token
    case 'openrouter':
    default:
      return Math.ceil(len / 3.8); // Conservative middle ground
  }
}
