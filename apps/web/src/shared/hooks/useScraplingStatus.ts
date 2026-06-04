import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

export type ScraplingStatus = 'checking' | 'running' | 'restarting' | 'offline';

export function useScraplingStatus(): ScraplingStatus {
  const [scraplingStatus, setScraplingStatus] = useState<ScraplingStatus>('checking');

  useEffect(() => {
    let active = true;
    const checkScrapling = async () => {
      try {
        const res = await fetchWithAuth('/api/v1/admin/scrapling-status');
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
