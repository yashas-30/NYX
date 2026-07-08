import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Zap, Cpu, Database, TrendingUp, AlertTriangle,
  RefreshCw, Clock, BarChart3, CheckCircle, XCircle, Layers
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LlmTrace {
  id: string;
  session_id: string | null;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  cached: number;
  error: string | null;
  agent_node_id: string | null;
  created_at: number;
}

interface ModelStats {
  model: string;
  provider: string;
  total_calls: number;
  avg_latency_ms: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  error_count: number;
  cache_hits: number;
}

interface ObservabilitySummary {
  total_calls: number;
  avg_latency_ms: number;
  total_tokens: number;
  error_rate: number;
  cache_hit_rate: number;
  model_stats: ModelStats[];
}

// ─── Tauri bridge ─────────────────────────────────────────────────────────────

const isTauriEnv =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnv) throw new Error(`Tauri not available: ${cmd}`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// No mock data — observability requires the desktop app (Tauri) for real metrics.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtTime(epoch: number) {
  return new Date(epoch * 1000).toLocaleTimeString();
}

function providerColor(provider: string) {
  const map: Record<string, string> = {
    google: '#4285F4',
    anthropic: '#D97706',
    openai: '#10A37F',
    'nyx-native': '#A855F7',
  };
  return map[provider] ?? '#6B7280';
}

function latencyColor(ms: number) {
  if (ms < 800) return '#22C55E';
  if (ms < 2000) return '#EAB308';
  return '#EF4444';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-xs text-white/40 font-medium tracking-wide uppercase">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </motion.div>
  );
}

function LatencyBar({ model, stats, max }: { model: string; stats: ModelStats; max: number }) {
  const pct = max > 0 ? (stats.avg_latency_ms / max) * 100 : 0;
  const errRate = stats.total_calls > 0 ? stats.error_count / stats.total_calls : 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-36 flex-shrink-0">
        <p className="text-xs text-white/70 font-medium truncate">{model}</p>
        <p className="text-[10px] text-white/30">{stats.provider}</p>
      </div>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: latencyColor(stats.avg_latency_ms) }}
        />
      </div>
      <div className="w-16 text-right">
        <span className="text-xs font-mono text-white/80">{fmtMs(stats.avg_latency_ms)}</span>
      </div>
      <div className="w-12 text-right">
        <span className={`text-[10px] font-mono ${errRate > 0.05 ? 'text-red-400' : 'text-white/30'}`}>
          {(errRate * 100).toFixed(1)}% err
        </span>
      </div>
    </div>
  );
}

function TraceRow({ trace }: { trace: LlmTrace }) {
  const isError = !!trace.error;
  const isCached = trace.cached === 1;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-b border-white/3 hover:bg-white/2 transition-colors"
    >
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: providerColor(trace.provider) }} />
          <div>
            <p className="text-xs text-white/80 font-medium">{trace.model}</p>
            <p className="text-[10px] text-white/30">{trace.provider}</p>
          </div>
        </div>
      </td>
      <td className="py-2 px-3">
        <span className="text-xs font-mono" style={{ color: latencyColor(trace.latency_ms) }}>
          {fmtMs(trace.latency_ms)}
        </span>
      </td>
      <td className="py-2 px-3">
        <span className="text-xs font-mono text-white/50">
          {trace.prompt_tokens > 0 ? fmtNum(trace.prompt_tokens) : '—'}
          {' / '}
          {trace.completion_tokens > 0 ? fmtNum(trace.completion_tokens) : '—'}
        </span>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          {isError ? (
            <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
              <XCircle size={9} /> {trace.error}
            </span>
          ) : isCached ? (
            <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
              <Zap size={9} /> cache
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              <CheckCircle size={9} /> ok
            </span>
          )}
        </div>
      </td>
      <td className="py-2 px-3">
        <span className="text-[10px] text-white/25 font-mono">{fmtTime(trace.created_at)}</span>
      </td>
      <td className="py-2 px-3">
        <span className="text-[10px] text-white/30 font-mono truncate max-w-[80px] block">
          {trace.agent_node_id ?? '—'}
        </span>
      </td>
    </motion.tr>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ObservabilityView() {
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null);
  const [traces, setTraces] = useState<LlmTrace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!isTauriEnv) {
      // Observability data is only available in the desktop app.
      if (!signal?.aborted) setIsLoading(false);
      return;
    }
    if (!signal?.aborted) {
      setIsLoading(true);
      setFetchError(null);
    }
    try {
      const [s, t] = await Promise.all([
        tauriInvoke<ObservabilitySummary>('get_observability_summary'),
        tauriInvoke<LlmTrace[]>('get_llm_traces', { limit: 50 }),
      ]);
      if (!signal?.aborted) {
        setSummary(s);
        setTraces(t);
        setLastRefresh(new Date());
      }
    } catch (err: unknown) {
      if (!signal?.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        setFetchError(msg);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    
    const interval = setInterval(() => {
      fetchData(controller.signal);
    }, 30_000); // Auto-refresh every 30s
    
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [fetchData]);

  const maxLatency = summary
    ? Math.max(...summary.model_stats.map((s) => s.avg_latency_ms), 1)
    : 1;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Activity size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">LLM Observability</h1>
            <p className="text-[11px] text-white/35">
              Last updated {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={isLoading}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* KPI cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={BarChart3}
              label="Total Calls"
              value={fmtNum(summary.total_calls)}
              sub="since first boot"
              color="#A855F7"
            />
            <StatCard
              icon={Clock}
              label="Avg Latency"
              value={fmtMs(summary.avg_latency_ms)}
              sub="across all models"
              color={latencyColor(summary.avg_latency_ms)}
            />
            <StatCard
              icon={Database}
              label="Total Tokens"
              value={fmtNum(summary.total_tokens)}
              sub="prompt + completion"
              color="#3B82F6"
            />
            <StatCard
              icon={summary.error_rate > 0.05 ? AlertTriangle : CheckCircle}
              label="Error Rate"
              value={`${(summary.error_rate * 100).toFixed(1)}%`}
              sub={`${(summary.cache_hit_rate * 100).toFixed(1)}% cache hits`}
              color={summary.error_rate > 0.05 ? '#EF4444' : '#22C55E'}
            />
          </div>
        )}

        {/* Per-model latency chart */}
        {summary && summary.model_stats.length > 0 && (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-violet-400" />
              <h2 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Per-Model Avg Latency</h2>
            </div>
            <div className="space-y-1">
              {summary.model_stats.map((s) => (
                <LatencyBar key={s.model} model={s.model} stats={s} max={maxLatency} />
              ))}
            </div>
          </div>
        )}

        {/* Model stats table */}
        {summary && summary.model_stats.length > 0 && (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers size={14} className="text-blue-400" />
              <h2 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Model Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Model', 'Provider', 'Calls', 'Avg Latency', 'Prompt Tokens', 'Comp. Tokens', 'Errors', 'Cache Hits'].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-white/30 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.model_stats.map((s) => (
                    <tr key={s.model} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                      <td className="py-2 px-3 text-white/80 font-medium">{s.model}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px]"
                          style={{ background: `${providerColor(s.provider)}20`, color: providerColor(s.provider) }}>
                          {s.provider}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-white/60 font-mono">{s.total_calls}</td>
                      <td className="py-2 px-3 font-mono" style={{ color: latencyColor(s.avg_latency_ms) }}>{fmtMs(s.avg_latency_ms)}</td>
                      <td className="py-2 px-3 text-white/50 font-mono">{fmtNum(s.total_prompt_tokens)}</td>
                      <td className="py-2 px-3 text-white/50 font-mono">{fmtNum(s.total_completion_tokens)}</td>
                      <td className="py-2 px-3 font-mono">
                        <span className={s.error_count > 0 ? 'text-red-400' : 'text-white/25'}>{s.error_count}</span>
                      </td>
                      <td className="py-2 px-3 text-blue-400 font-mono">{s.cache_hits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent traces table */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-emerald-400" />
              <h2 className="text-xs font-semibold text-white/70 uppercase tracking-wide">Recent Traces</h2>
            </div>
            <span className="text-[10px] text-white/25">{traces.length} records</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="text-white/20 animate-spin" />
            </div>
          ) : traces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Activity size={32} className="text-white/10" />
              <p className="text-sm text-white/25">No traces yet. Make an LLM call to start recording.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Model', 'Latency', 'Tokens (p/c)', 'Status', 'Time', 'Node'].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-white/30 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {traces.map((t) => <TraceRow key={t.id} trace={t} />)}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Non-Tauri environment notice */}
        {!isTauriEnv && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Activity size={28} className="text-amber-400/60" />
            </div>
            <p className="text-sm text-white/50">Desktop App Required</p>
            <p className="text-xs text-white/25 text-center max-w-xs">
              LLM observability data is recorded by the native Tauri backend. Open the NYX desktop app to view real metrics.
            </p>
          </div>
        )}

        {/* Fetch error state */}
        {isTauriEnv && fetchError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-400/60" />
            </div>
            <p className="text-sm text-white/50">Failed to load observability data</p>
            <p className="text-xs text-red-400/60 font-mono">{fetchError}</p>
            <button
              onClick={() => fetchData()}
              className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state when no summary yet (Tauri but no data) */}
        {isTauriEnv && !summary && !isLoading && !fetchError && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Activity size={28} className="text-violet-400/50" />
            </div>
            <p className="text-sm text-white/30">No observability data yet.</p>
            <p className="text-xs text-white/20">LLM calls will be recorded automatically once you use the chat.</p>
          </div>
        )}
      </div>
    </div>
  );
}
