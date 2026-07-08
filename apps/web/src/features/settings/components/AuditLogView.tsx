import React, { useState, useEffect } from 'react';
import { FileText, Clock, AlertTriangle } from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
}

const isTauriEnv =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnv) throw new Error(`Tauri not available: ${cmd}`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriEnv) {
      setIsLoading(false);
      return;
    }
    tauriInvoke<AuditLog[]>('get_audit_logs', { limit: 50 })
      .then(setLogs)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="bg-card border border-border rounded-md p-6 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={16} className="text-accent" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">
          Settings Audit Log
        </h3>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <div className="w-4 h-4 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && !isTauriEnv && (
        <p className="text-[11px] text-muted-foreground/60 text-center py-4">
          Audit logs are only available in the NYX desktop app.
        </p>
      )}

      {!isLoading && isTauriEnv && error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400/70 py-4">
          <AlertTriangle size={12} />
          <span>{error}</span>
        </div>
      )}

      {!isLoading && isTauriEnv && !error && logs.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center py-4">
          No audit events recorded yet.
        </p>
      )}

      {!isLoading && logs.length > 0 && (
        <div className="space-y-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex gap-4 items-start pb-3 border-b border-border last:border-0 last:pb-0"
            >
              <div className="pt-0.5">
                <Clock size={12} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">{log.action}</p>
                <p className="text-[10px] text-muted-foreground">{log.details}</p>
                <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">
                  {new Date(log.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
