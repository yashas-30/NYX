import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';


export type ScraplingStatus = 'checking' | 'running' | 'restarting' | 'offline';

export function useScraplingStatus(): ScraplingStatus {
  const [scraplingStatus, setScraplingStatus] = useState<ScraplingStatus>('checking');

  useEffect(() => {
    let active = true;
    const checkScrapling = async () => {
      try {
        const res: any = { ok: true, json: async () => await invoke('admin_scrapling_status') };
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setScraplingStatus(data.status || 'offline');
        } else {
          setScraplingStatus('offline');
        }
      } catch {
        if (!active) return;
        setScraplingStatus('offline');
      }
    };
    checkScrapling();
    const interval = setInterval(checkScrapling, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return scraplingStatus;
}
