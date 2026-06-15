import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface ProviderStatus {
  connected: boolean;
  models: { name: string }[];
  port: string;
}

interface LocalStatus {
  ollama: ProviderStatus;
  lmstudio: ProviderStatus;
}

export function LocalProviderStatus() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/v1/nyx/local-models/status');
      if (res.ok) {
        setStatus(await res.json());
        setLastUpdated(new Date());
      }
    } catch {
      // silently fail
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
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/40 border border-white/5 animate-pulse">
        <div className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="text-xs text-zinc-600">Local providers...</span>
      </div>
    );
  }

  const providers: Array<{ key: keyof LocalStatus; label: string; data: ProviderStatus }> = [
    { key: 'ollama', label: 'Ollama', data: status.ollama },
    { key: 'lmstudio', label: 'LM Studio', data: status.lmstudio },
  ];

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-zinc-900/50 border border-white/5 text-xs">
      {providers.map(({ key, label, data }) => (
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
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              data.connected ? 'bg-emerald-400' : 'bg-zinc-600'
            }`}
            animate={
              data.connected
                ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
                : {}
            }
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className={data.connected ? 'text-zinc-300' : 'text-zinc-600'}>
            {label}
            {data.connected && (
              <span className="ml-1 text-emerald-400/70 font-mono">{data.models.length}</span>
            )}
          </span>
        </div>
      ))}
      <button
        onClick={fetchStatus}
        disabled={loading}
        className="ml-1 text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
        title={lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Refresh status'}
      >
        <motion.span
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
          style={{ display: 'inline-block' }}
        >
          ↻
        </motion.span>
      </button>
    </div>
  );
}
