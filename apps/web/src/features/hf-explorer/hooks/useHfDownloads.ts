// src/features/hf-explorer/hooks/useHfDownloads.ts
import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { useDownloadStore } from '../../../core/stores/useDownloadStore';
import type { DownloadProgress } from '../types';

interface RestoredDownload {
  model_id: string;
  filename: string;
  url: string;
  total_size: number;
  downloaded: number;
  is_running: boolean;
}

export function useHfDownloads() {
  const { setDownloadState, removeDownload } = useDownloadStore();
  const queryClient = useQueryClient();
  const isSetupRef = useRef(false);

  useEffect(() => {
    if (isSetupRef.current) return;
    isSetupRef.current = true;

    const unlistens: UnlistenFn[] = [];

    const setup = async () => {
      // ── Reconcile restored downloads from the backend ─────────────────────
      // On app start, the backend tracks partially-downloaded .gguf.part files.
      // We query these and surface them as "paused" so the user can resume them.
      // Any store entry that the backend has no record for is removed (stale).
      try {
        const isTauri =
          typeof window !== 'undefined' &&
          ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
        if (isTauri) {
          const restored = await invoke<RestoredDownload[]>('hf_get_restored_downloads');

          // Surface each restored-but-not-running download as "paused"
          for (const r of restored) {
            if (!r.is_running) {
              const progress = r.total_size > 0 ? (r.downloaded / r.total_size) * 100 : 0;
              setDownloadState(r.model_id, {
                status: 'paused',
                progress,
                downloaded: r.downloaded,
                total: r.total_size,
                error: undefined,
              });
            }
          }

          // Remove any "paused" store entries that the backend has no part file for.
          // This cleans up entries from models that were cancelled/completed in a
          // previous session but whose store entries survived as "paused".
          const storeSnashot = useDownloadStore.getState().downloads;
          for (const key of Object.keys(storeSnashot)) {
            if (storeSnashot[key].status !== 'paused') continue;
            const filename = key.split('/').pop() || key;
            const backendHasIt = restored.some(
              (r) => r.model_id === key || r.filename === filename
            );
            if (!backendHasIt) {
              removeDownload(key);
            }
          }
        }
      } catch {
        // hf_get_restored_downloads failing is non-fatal (e.g. web / test build)
      }

      // ── Progress events ───────────────────────────────────────────────────
      let lastProgressTime = 0;
      const progressUnlisten = await listen<DownloadProgress>('hf-download-progress', (e) => {
        const now = Date.now();
        if (now - lastProgressTime < 100 && e.payload.progress < 99.9) return;
        lastProgressTime = now;
        setDownloadState(e.payload.model_id, {
          progress: e.payload.progress,
          downloaded: e.payload.downloaded,
          total: e.payload.total,
          status: 'downloading',
          error: undefined,
        });
      });
      unlistens.push(progressUnlisten);

      // ── Completion events ─────────────────────────────────────────────────
      const completeUnlisten = await listen<{ model_id: string }>('hf-download-complete', (e) => {
        setDownloadState(e.payload.model_id, { status: 'completed', progress: 100, error: undefined });
        useDownloadStore.getState().setDownloadState(e.payload.model_id, { status: 'completed', progress: 100 });
        queryClient.invalidateQueries({ queryKey: ['localModels'] });
        // Remove after 2 s so the user sees the "Done" state briefly
        setTimeout(() => removeDownload(e.payload.model_id), 2000);
      });
      unlistens.push(completeUnlisten);

      // ── Error events ──────────────────────────────────────────────────────
      const errorUnlisten = await listen<{ model_id: string; error: string }>('hf-download-error', (e) => {
        const errStr = (e.payload.error || '').toLowerCase();
        if (
          errStr.includes('cancel') ||
          errStr.includes('download paused')
        ) {
          removeDownload(e.payload.model_id);
        } else {
          setDownloadState(e.payload.model_id, { status: 'error', error: e.payload.error });
        }
      });
      unlistens.push(errorUnlisten);
    };

    setup().catch(console.error);

    return () => {
      unlistens.forEach((fn) => fn());
      isSetupRef.current = false;
    };
  }, [setDownloadState, removeDownload, queryClient]);
}

export function useDownloadActions() {
  const { setDownloadState, removeDownload } = useDownloadStore();
  const queryClient = useQueryClient();

  const handleDownload = async (selectedModel: string, filename: string) => {
    const cleanRepo = selectedModel.trim().replace(/^\/+|\/+$/g, '');
    const cleanFn = filename.trim().replace(/^\/+/g, '');
    const key = `${cleanRepo}/${cleanFn}`;
    const encodedFn = cleanFn.split('/').map(encodeURIComponent).join('/');
    const url = `https://huggingface.co/${cleanRepo}/resolve/main/${encodedFn}`;

    setDownloadState(key, { progress: 0, downloaded: 0, total: 0, status: 'downloading', error: undefined });
    try {
      await invoke('hf_download_model', {
        url,
        modelId: key,
        filename: cleanFn,
        repoId: cleanRepo,
      });
    } catch (err) {
      setDownloadState(key, { status: 'error', error: String(err) });
    }
  };

  const handlePause = async (id: string) => {
    setDownloadState(id, { status: 'paused' });
    try {
      await invoke('hf_pause_download', { modelId: id });
    } catch (err) {
      console.error('Failed to pause download:', err);
    }
  };

  const handleResume = async (id: string) => {
    setDownloadState(id, { status: 'downloading', error: undefined });
    try {
      await invoke('hf_resume_download', { modelId: id });
    } catch (err) {
      console.warn('hf_resume_download task not found in memory, falling back to hf_download_model...', err);
      const parts = id.split('/');
      const filename = parts.pop() || id;
      const cleanFn = filename.trim().replace(/^\/+/g, '');
      const repoId = parts.join('/').replace(/^\/+|\/+$/g, '');
      const encodedFn = cleanFn.split('/').map(encodeURIComponent).join('/');
      const url = `https://huggingface.co/${repoId}/resolve/main/${encodedFn}`;
      try {
        await invoke('hf_download_model', {
          url,
          modelId: id,
          filename: cleanFn,
          repoId,
        });
      } catch (dlErr) {
        console.error('Failed to retry download:', dlErr);
        setDownloadState(id, { status: 'error', error: String(dlErr) });
      }
    }
  };

  const handleCancel = async (id: string) => {
    removeDownload(id);
    try {
      await invoke('hf_cancel_download', { modelId: id });
    } catch (err) {
      console.error('Failed to cancel download:', err);
    } finally {
      removeDownload(id);
      queryClient.invalidateQueries({ queryKey: ['localModels'] });
    }
  };

  return { handleDownload, handlePause, handleResume, handleCancel };
}
