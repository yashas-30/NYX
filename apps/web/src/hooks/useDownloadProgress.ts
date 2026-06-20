import { useState, useCallback, useEffect } from 'react';
import { useDownloadWebSocket } from './useWebSocket';

export interface DownloadProgress {
  modelId: string;
  status: 'downloading' | 'completed' | 'failed' | 'verifying';
  downloadedBytes?: number;
  totalBytes?: number;
  percentage?: number;
  speedBytesPerSec?: number;
  error?: string;
  timestamp: number;
}

export function useDownloadProgress(modelId?: string) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const { on, off, isConnected, connect } = useDownloadWebSocket();

  useEffect(() => {
    if (!modelId) return;

    const cleanup = on('progress', (data: DownloadProgress) => {
      if (data.modelId === modelId) {
        setProgress(data);
      }
    });

    connect();

    return () => {
      cleanup();
      if (progress?.status === 'completed' || progress?.status === 'failed') {
        setProgress(null);
      }
    };
  }, [modelId, on, off, connect]);

  const reset = useCallback(() => {
    setProgress(null);
  }, []);

  return { progress, isConnected, reset };
}

export function useAllDownloadProgress() {
  const [allProgress, setAllProgress] = useState<Record<string, DownloadProgress>>({});
  const { on, off, isConnected, connect } = useDownloadWebSocket();

  useEffect(() => {
    const cleanup = on('progress', (data: DownloadProgress) => {
      setAllProgress((prev) => ({
        ...prev,
        [data.modelId]: data,
      }));
    });

    connect();

    return () => {
      cleanup();
    };
  }, [on, off, connect]);

  const getProgress = useCallback(
    (id: string) => allProgress[id] || null,
    [allProgress]
  );

  const clearProgress = useCallback((id: string) => {
    setAllProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setAllProgress({});
  }, []);

  return { allProgress, getProgress, clearProgress, clearAll, isConnected };
}
