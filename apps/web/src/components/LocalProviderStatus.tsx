import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
// Removed fetchWithAuth

interface ProviderStatus {
  connected: boolean;
  models: { name: string }[];
  port: string;
}

interface LocalStatus {
  tauri: ProviderStatus;
}

export function LocalProviderStatus() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      // Use Tauri's invoke to check the local server — avoids WebView CSP blocking
      // direct fetch() calls to 127.0.0.1 on some OS configurations.
      const { invoke } = await import('@tauri-apps/api/core');
      const data: any = await invoke('check_local_server_status').catch(() => null);
      if (data) {
        setStatus({
          tauri: {
            connected: true,
            models: data.data || [{ name: 'local-model' }],
            port: '8080',
          }
        });
        setLastUpdated(new Date());
      } else {
        setStatus({ tauri: { connected: false, models: [], port: '8080' } });
      }
    } catch {
      setStatus({ tauri: { connected: false, models: [], port: '8080' } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!status) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border animate-pulse">
        <div className="w-1.5 h-1.5 rounded-full bg-muted" />
        <span className="text-xs text-muted-foreground/60">Local providers...</span>
      </div>
    );
  }

  const providers: Array<{ key: keyof LocalStatus; label: string; data: ProviderStatus | undefined }> = [
    { key: 'tauri', label: 'Tauri Native', data: status.tauri },
  ];

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-card border border-border text-xs">
      {providers.map(({ key, label, data }) => data ? (
        <div
          key={key}
          className="flex items-center gap-1.5"
          title={`${label}: ${
            data.connected
              ? `${data.models.length} model(s) on :${data.port}`
              : `Not running on :${data.port}`
          }`}
        >
          <motion.div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              data.connected ? 'bg-emerald-400' : 'bg-muted'
            }`}
            animate={
              data.connected
                ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
                : {}
            }
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className={data.connected ? 'text-foreground/80' : 'text-muted-foreground/60'}>
            {label}
            {data.connected && (
              <span className="ml-1 text-emerald-400/70 font-mono">{data.models.length}</span>
            )}
          </span>
        </div>
      ) : null)}
      <button
        onClick={fetchStatus}
        disabled={loading}
        className="ml-1 text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all disabled:opacity-40 cursor-pointer"
        title={lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Refresh status'}
      >
        <motion.span
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
          style={{ display: 'inline-block' }}
        >
          <RefreshCw className="w-3 h-3" />
        </motion.span>
      </button>
    </div>
  );
}
