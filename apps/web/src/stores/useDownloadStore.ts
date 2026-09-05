import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'error';

export interface DownloadState {
  progress: number;
  downloaded: number;
  total: number;
  status: DownloadStatus;
  error?: string;
  speed?: number;
  eta?: number;
}

interface DownloadStore {
  downloads: Record<string, DownloadState>;
  setDownloadState: (modelId: string, state: Partial<DownloadState>) => void;
  removeDownload: (modelId: string) => void;
  clearDownloads: () => void;
}

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set) => ({
      downloads: {},
      setDownloadState: (modelId, state) =>
        set((prev) => {
          const filename = modelId.split('/').pop() || modelId;
          const existingKey =
            Object.keys(prev.downloads).find(
              (k) => k === modelId || k.endsWith('/' + filename) || k.split('/').pop() === filename
            ) || modelId;

          return {
            downloads: {
              ...prev.downloads,
              [existingKey]: {
                ...(prev.downloads[existingKey] || {
                  progress: 0,
                  downloaded: 0,
                  total: 0,
                  status: 'pending',
                }),
                ...state,
              },
            },
          };
        }),
      removeDownload: (modelId) =>
        set((prev) => {
          const newDownloads = { ...prev.downloads };
          const filename = modelId.split('/').pop() || modelId;
          for (const k of Object.keys(newDownloads)) {
            if (k === modelId || k.endsWith('/' + filename) || k.split('/').pop() === filename) {
              delete newDownloads[k];
            }
          }
          return { downloads: newDownloads };
        }),
      clearDownloads: () => set({ downloads: {} }),
    }),
    {
      name: 'nyx-downloads-store',
      onRehydrateStorage: () => (state) => {
        if (state) {
          Object.keys(state.downloads).forEach((key) => {
            const download = state.downloads[key];
            if (download.status === 'downloading' || download.status === 'pending') {
              state.setDownloadState(key, { status: 'paused' });
            }
          });
        }
      },
    }
  )
);
