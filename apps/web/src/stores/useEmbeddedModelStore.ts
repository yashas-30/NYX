/**
 * useEmbeddedModelStore
 *
 * Tracks the state of the embedded llama-server sidecar:
 * - Polls status on mount
 * - Listens to download progress events
 * - Triggers download / startup
 */
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type EmbeddedState =
  | 'not_started'
  | 'starting'
  | 'ready'
  | 'failed'
  | 'model_missing'
  | 'downloading';

export interface DownloadProgress {
  percent: number;
  bytes_done: number;
  total_bytes: number;
  done?: boolean;
}

export interface EmbeddedStats {
  training_examples: number;
  dataset_path: string;
}

interface EmbeddedModelState {
  state: EmbeddedState;
  error: string | null;
  port: number;
  modelName: string;
  download: DownloadProgress | null;
  stats: EmbeddedStats | null;
  unlisten: UnlistenFn | null;

  // Actions
  init: () => Promise<void>;
  startDownload: () => Promise<void>;
  refresh: () => Promise<void>;
  fetchStats: () => Promise<void>;
  triggerFinetune: () => Promise<void>;
  cleanup: () => void;
}

export const useEmbeddedModelStore = create<EmbeddedModelState>((set, get) => ({
  state: 'not_started',
  error: null,
  port: 11435,
  modelName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  download: null,
  stats: null,
  unlisten: null,

  init: async () => {
    // Subscribe to download progress events
    const unlisten = await listen<DownloadProgress>('nyx://llm-download-progress', (event) => {
      const p = event.payload;
      set({ download: p, state: p.done ? 'starting' : 'downloading' });
    });
    set({ unlisten });

    // Check initial status
    await get().refresh();

    // If model is ready or starting, poll until ready
    const poll = setInterval(async () => {
      await get().refresh();
      const { state } = get();
      if (state === 'ready' || state === 'failed' || state === 'model_missing') {
        clearInterval(poll);
        // Fetch stats once ready
        if (state === 'ready') await get().fetchStats();
      }
    }, 2000);
  },

  refresh: async () => {
    try {
      const status = await invoke<{
        state: string;
        error: string | null;
        port: number;
        model: string;
      }>('llm_embedded_status');

      set({
        state: status.state as EmbeddedState,
        error: status.error,
        port: status.port,
        modelName: status.model,
      });
    } catch (e: any) {
      // Tauri not available (web dev mode) — ignore
    }
  },

  fetchStats: async () => {
    try {
      const s = await invoke<EmbeddedStats>('llm_embedded_stats');
      set({ stats: s });
    } catch {
      // non-critical
    }
  },

  startDownload: async () => {
    set({ state: 'downloading', download: { percent: 0, bytes_done: 0, total_bytes: 0 } });
    try {
      await invoke('llm_download_model');
      // After completion, server auto-starts — poll for ready
      set({ state: 'starting', download: null });
      const poll = setInterval(async () => {
        await get().refresh();
        if (get().state === 'ready' || get().state === 'failed') {
          clearInterval(poll);
          if (get().state === 'ready') await get().fetchStats();
        }
      }, 1500);
    } catch (e: any) {
      set({ state: 'failed', error: String(e) });
    }
  },

  triggerFinetune: async () => {
    try {
      await invoke('llm_embedded_finetune');
      // Refresh stats after finetune consumes the JSONL file
      await get().fetchStats();
    } catch (e: any) {
      console.error('Finetune failed:', e);
    }
  },

  cleanup: () => {
    const { unlisten } = get();
    unlisten?.();
    set({ unlisten: null });
  },
}));
