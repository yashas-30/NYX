// Forced HMR re-transpilation trigger comment
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Globe, Box, Server, Terminal as TerminalIcon, Settings as SettingsIcon,
  Cpu, HardDrive, Play, Square, Download, AlertCircle, CheckCircle2, Loader2
} from 'lucide-react';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { OllamaModel, ModelOption, LMStudioModel } from '@/src/types';
import { useTokenUsage } from '@/src/context/TokenUsageContext';
import { toast } from 'sonner';

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface ModelRegistryViewProps {
  models?: Record<'nyx', string>;
  ollamaModels: OllamaModel[];
  ollamaStatus: 'idle' | 'loading' | 'error' | 'ok';
  ollamaError: string;
  lmStudioModels: LMStudioModel[];
  lmStudioStatus: 'idle' | 'loading' | 'error' | 'ok';
  lmStudioBaseUrl: string;
  setLmStudioBaseUrl: (url: string) => void;
  onRefreshOllama: () => void;
  onRefreshLMStudio: () => void;
  selectModel?: (modelId: string) => void;
  apiKeys: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  localModelsEnabled: boolean;
  setLocalModelsEnabled: (enabled: boolean) => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ───────────────────────────────────────────────────────────────────────────── */

/** Status badge with pulse indicator */
const StatusBadge: React.FC<{
  status: 'idle' | 'loading' | 'error' | 'ok';
}> = ({ status }) => {
  const isOk = status === 'ok';
  const isLoading = status === 'loading';
  return (
    <div className={`
      inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[8px] font-bold uppercase tracking-tight
      ${isOk
        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
        : isLoading
          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
          : 'bg-red-500/10 text-red-500 border border-red-500/20'
      }
    `}>
      <div className={`
        w-1.5 h-1.5 rounded-full
        ${isOk ? 'bg-emerald-500 animate-pulse' : isLoading ? 'bg-amber-500 animate-bounce' : 'bg-red-500'}
      `} />
      {isOk ? 'Online' : isLoading ? 'Syncing' : 'Offline'}
    </div>
  );
};

/** Section header with icon, title, and right-side controls */
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}> = ({ icon, title, subtitle, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 dark:border-white/5">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-[12px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-sm transition-transform duration-500 hover:rotate-6">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
        <p className="text-[9px] font-medium text-muted-foreground/70 uppercase tracking-widest mt-0.5">{subtitle}</p>
      </div>
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);

/** Empty state for when no models are found */
const EmptyState: React.FC<{ message: string; hint: string }> = ({ message, hint }) => (
  <div className="py-12 rounded-2xl border border-dashed border-white/15 dark:border-white/5 flex flex-col items-center justify-center text-center bg-white/10 dark:bg-white/5">
    <Box size={32} className="text-muted-foreground/15 mb-3" />
    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/80">{message}</p>
    <p className="text-[8px] text-muted-foreground/60 mt-1.5 max-w-[280px]">{hint}</p>
  </div>
);

/** Pure display model card — library view only, no add functionality */
const ModelCard: React.FC<{
  name: string;
  provider: string;
  description: string;
  specs?: { contextWindow: string; maxOutput: string; modality: string };
  usage?: { used: number; remaining: number };
  hasKey?: boolean;
  status?: 'online' | 'offline' | 'no-key';
}> = ({ name, provider, description, specs, usage, hasKey, status }) => {
  const providerLabel = provider === 'lmstudio' ? 'LM Studio' : provider;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group relative p-3 rounded-2xl border border-solid flex flex-col gap-2.5 transform-gpu transition-all duration-500 overflow-hidden shadow-sm bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border-white/20 dark:border-white/5 hover:border-primary/30 hover:bg-white/60 dark:hover:bg-zinc-800/40"
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      {/* Provider badge + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {providerLabel}
            </span>
            {status && (
              <span className={`
                text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full
                ${status === 'online' ? 'bg-emerald-500/10 text-emerald-500' :
                  status === 'offline' ? 'bg-red-500/10 text-red-500' :
                  'bg-amber-500/10 text-amber-500'}
              `}>
                {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Auth'}
              </span>
            )}
          </div>
          <h4 className="text-[12px] font-bold truncate leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors">
            {name}
          </h4>
        </div>
      </div>

      {/* Description */}
      <p className="text-[9px] text-muted-foreground/80 line-clamp-2 leading-relaxed font-medium">{description}</p>

      {/* Specs grid */}
      {(specs || (usage && hasKey)) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 border-t border-border/30">
          {specs && (
            <>
              <div className="flex flex-col">
                <span className="text-[6px] font-black uppercase tracking-widest text-muted-foreground/70">Context</span>
                <span className="text-[8px] font-bold text-foreground/70">{specs.contextWindow}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[6px] font-black uppercase tracking-widest text-muted-foreground/70">Modality</span>
                <span className="text-[8px] font-bold text-foreground/70">{specs.modality}</span>
              </div>
            </>
          )}
          {usage && hasKey && (
            <>
              <div className="flex flex-col">
                <span className="text-[6px] font-black uppercase tracking-widest text-primary/50">Used</span>
                <span className="text-[8px] font-bold text-primary/80">{(usage.used / 1000).toFixed(1)}k</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[6px] font-black uppercase tracking-widest text-emerald-500/50">Remaining</span>
                <span className="text-[8px] font-bold text-emerald-400/80">{(usage.remaining / 1000).toFixed(1)}k</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quota Exceeded Message */}
      {hasKey && usage && usage.remaining <= 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 p-2.5 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center gap-2"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-destructive">Quota Reached</span>
        </motion.div>
      )}
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Main Registry View
 * ───────────────────────────────────────────────────────────────────────────── */

const ModelRegistryViewComponent: React.FC<ModelRegistryViewProps> = ({
  ollamaModels,
  ollamaStatus,
  ollamaError,
  lmStudioModels,
  lmStudioStatus,
  lmStudioBaseUrl,
  setLmStudioBaseUrl,
  onRefreshOllama,
  onRefreshLMStudio,
  selectModel,
  apiKeys,
  providerStatuses,
  ollamaBaseUrl,
  setOllamaBaseUrl,
  activeMode,
  setActiveMode,
  localModelsEnabled,
  setLocalModelsEnabled,
}) => {
  const { usage } = useTokenUsage();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'nyx' | 'cloud' | 'local'>('all');

  // Google Gemini Credentials Helpers
  const hasGeminiKey = !!apiKeys?.gemini;
  const isGeminiActive = hasGeminiKey && providerStatuses?.['gemini'] === 'online';
  const keyMask = useMemo(() => {
    const key = apiKeys?.gemini;
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 6)}••••${key.slice(-4)}`;
  }, [apiKeys?.gemini]);

  // Native GGUF local model states
  const [nativeModels, setNativeModels] = useState<any[]>([]);
  const [activeNativeId, setActiveNativeId] = useState<string | null>(null);
  const [nativeStatus, setNativeStatus] = useState<{ status: string; error: string | null }>({ status: 'stopped', error: null });
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchNativeModels = useCallback(async () => {
    try {
      const res = await fetch('/api/nyx/local-models');
      if (res.ok) {
        const data = await res.json();
        if (data.models) setNativeModels(data.models);
        if (data.activeModelId) setActiveNativeId(data.activeModelId);
        else setActiveNativeId(null);
        if (data.runnerStatus) setNativeStatus(data.runnerStatus);
      }
    } catch (err) {
      console.error('[Registry] Failed to fetch native models:', err);
    }
  }, []);

  useEffect(() => {
    fetchNativeModels();
    const interval = setInterval(fetchNativeModels, 2000);
    return () => clearInterval(interval);
  }, [fetchNativeModels]);

  const handleDownload = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      const res = await fetch('/api/nyx/local-models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      if (res.ok) {
        toast.success('Download started directly within NYX.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Download failed to start: ${errData.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRun = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      const res = await fetch('/api/nyx/local-models/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      if (res.ok) {
        toast.success('Model loaded natively in Resident RAM.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Failed to load model: ${errData.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStop = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      const res = await fetch('/api/nyx/local-models/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        toast.success('Model unloaded from Resident RAM. Memory released.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Failed to unload model: ${errData.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const query = search.toLowerCase();

  /* ── Filtered model lists ─────────────────────────────────────────────── */

  const filteredOllama = useMemo(
    () => ollamaModels.filter(m => m.name.toLowerCase().includes(query)),
    [ollamaModels, query]
  );

  const filteredLMStudio = useMemo(
    () => lmStudioModels.filter(m => m.id.toLowerCase().includes(query)),
    [lmStudioModels, query]
  );

  const cloudModels = useMemo(
    () => AVAILABLE_MODELS.filter(m =>
      m.name.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query)
    ),
    [query]
  );

  const groupedCloud = useMemo(() => {
    const grouped = cloudModels.reduce((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = [];
      acc[m.provider].push(m);
      return acc;
    }, {} as Record<string, ModelOption[]>);

    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'gemini') return -1;
      if (b === 'gemini') return 1;
      return a.localeCompare(b);
    });
  }, [cloudModels]);

  const showNyx = filter === 'all' || filter === 'nyx';
  const showLocal = localModelsEnabled && (filter === 'all' || filter === 'local');
  const showCloud = filter === 'all' || filter === 'cloud';

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <motion.div
      key="registry"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/5 dark:bg-black/10 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Box size={16} className="text-primary" />
            <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">Model Registry</h2>
          </div>


          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative group">
              <Search size={12} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 transition-colors group-focus-within:text-primary" />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                    setTimeout(() => {
                      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                    }, 100);
                  }
                }}
                className="
                  bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 rounded-full
                  text-[9px] font-medium text-foreground
                  pl-8 pr-3 py-1.5 w-40 sm:w-48
                  outline-none focus:border-primary/20
                  transition-all placeholder:text-muted-foreground/20 shadow-sm
                "
              />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-white/30 dark:bg-zinc-900/30 backdrop-blur-sm p-1 rounded-full border border-white/15 dark:border-white/5 shadow-sm">
              {(['all', 'nyx', 'cloud', 'local'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-tight transition-all
                    ${filter === f
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5'
                    }
                  `}
                >
                  {f === 'all' ? 'All' : f === 'nyx' ? 'NYX Native' : f === 'cloud' ? 'Cloud' : 'Local Servers'}
                </button>
              ))}
            </div>

            {/* Local Models Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/10 border border-border-strong">
              <Server size={10} className={localModelsEnabled ? 'text-primary' : 'text-muted-foreground/30'} />
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">Local Servers (Ollama/LM Studio)</span>
              <button
                onClick={() => {
                  setLocalModelsEnabled(!localModelsEnabled);
                  if (!localModelsEnabled) {
                    onRefreshOllama();
                    onRefreshLMStudio();
                  }
                }}
                className={`
                  w-8 h-4 rounded-full transition-colors duration-200 relative flex items-center px-0.5
                  ${localModelsEnabled ? 'bg-primary' : 'bg-muted-foreground/20'}
                `}
              >
                <div className={`
                  w-3 h-3 rounded-full bg-background shadow-sm transition-transform duration-200
                  ${localModelsEnabled ? 'translate-x-4' : 'translate-x-0'}
                `} />
              </button>
            </div>
          </div>
        </header>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

          {/* ════════════════════════════════════════════════════════════════
           *  NYX NATIVE LOCAL LIBRARY SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showNyx && (
            <section className="space-y-4 p-5 rounded-2xl bg-gradient-to-br from-[#120B1C]/30 to-[#181224]/20 dark:from-[#120B1C]/50 dark:to-[#181224]/30 backdrop-blur-md border border-[#9b4dff]/25 shadow-[0_8px_32px_rgba(155,77,255,0.08)]">
              <SectionHeader
                icon={<Cpu size={18} className="text-purple-400 animate-pulse" />}
                title="NYX Native Local Library"
                subtitle="Directly download and host GGUF models natively"
              >
                {/* Direct RAM Load Status Badge */}
                <div className={`
                  inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[8px] font-bold uppercase tracking-tight
                  ${activeNativeId 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'}
                `}>
                  <div className={`
                    w-1.5 h-1.5 rounded-full
                    ${activeNativeId ? 'bg-emerald-400 animate-ping' : 'bg-zinc-400'}
                  `} />
                  {activeNativeId ? 'Model Loaded in RAM' : 'No Model in RAM'}
                </div>
              </SectionHeader>

              {nativeModels.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center">
                  <Loader2 size={24} className="text-primary animate-spin mb-2" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Syncing Presets...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {nativeModels.map(m => {
                    const isResident = activeNativeId === m.id;
                    const isDownloading = m.status === 'downloading';
                    const isCompleted = m.status === 'completed';
                    const isIdle = m.status === 'idle' || m.status === 'failed';
                    const progress = m.progress || { progressPercentage: 0, speedMbps: 0, bytesDownloaded: 0, totalBytes: 0 };
                    const isCurrentAction = actionInProgress === m.id;

                    return (
                      <motion.div
                        key={`native-${m.id}`}
                        whileHover={{ y: -2, scale: 1.01 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className={`
                          group relative p-4 rounded-2xl border border-solid flex flex-col justify-between gap-3 overflow-hidden shadow-sm backdrop-blur-md transition-all duration-300
                          ${isResident
                            ? 'bg-[#181224]/80 border-[#9b4dff]/45 shadow-[0_0_20px_rgba(155,77,255,0.15)] dark:bg-[#120B1C]/90'
                            : 'bg-white/40 dark:bg-zinc-900/30 border-white/20 dark:border-white/5 hover:border-[#9b4dff]/30 hover:bg-white/60 dark:hover:bg-zinc-800/40'
                          }
                        `}
                      >
                        <div>
                          {/* Presets badges */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-block text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              NYX Native
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isResident && (
                                <span className="inline-flex items-center gap-1 text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  Resident RAM
                                </span>
                              )}
                              {isCompleted && !isResident && (
                                <span className="text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 dark:text-zinc-300 border border-zinc-500/20">
                                  Ready
                                </span>
                              )}
                              {isDownloading && (
                                <span className="text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                                  Downloading
                                </span>
                              )}
                            </div>
                          </div>

                          <h4 className="text-[12px] font-black tracking-tight text-foreground group-hover:text-purple-400 transition-colors">
                            {m.name}
                          </h4>
                          <p className="text-[9px] text-muted-foreground/80 line-clamp-2 leading-relaxed font-medium mt-1">
                            {m.description}
                          </p>

                          {/* Technical attributes */}
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-border/30">
                            <div className="flex flex-col">
                              <span className="text-[6px] font-black uppercase tracking-widest text-muted-foreground/60">GGUF File Size</span>
                              <span className="text-[8px] font-extrabold text-foreground/80">{m.size}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[6px] font-black uppercase tracking-widest text-muted-foreground/60">Required Spec</span>
                              <span className="text-[8px] font-extrabold text-purple-400/80">{m.ramRequired}</span>
                            </div>
                          </div>
                        </div>

                        {/* Interactive operations panel */}
                        <div className="mt-2.5 pt-2.5 border-t border-border/30">
                          {isDownloading && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-widest text-muted-foreground">
                                <span>{progress.progressPercentage}% Completed</span>
                                <span>{progress.speedMbps > 0 ? `${progress.speedMbps} MB/s` : 'Connecting...'}</span>
                              </div>
                              <div className="w-full h-1 rounded-full bg-black/20 dark:bg-white/5 overflow-hidden">
                                <motion.div
                                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                                  style={{ width: `${progress.progressPercentage}%` }}
                                  initial={{ width: '0%' }}
                                  animate={{ width: `${progress.progressPercentage}%` }}
                                  transition={{ duration: 0.3 }}
                                />
                              </div>
                              <div className="text-[7px] font-medium text-muted-foreground/50 text-right">
                                {progress.totalBytes > 0 
                                  ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB`
                                  : 'Negotiating HTTP download streams...'}
                              </div>
                            </div>
                          )}

                          {m.status === 'failed' && (
                            <div className="p-2 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[7px] font-semibold text-red-400 flex items-start gap-1.5">
                              <AlertCircle size={10} className="shrink-0 mt-0.5" />
                              <span>{progress.error || 'Download failed. Please check network connections.'}</span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1.5 mt-1">
                            {isIdle && (
                              <button
                                onClick={() => handleDownload(m.id)}
                                disabled={isCurrentAction || !!actionInProgress}
                                className="
                                  w-full py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                  bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 disabled:opacity-40
                                "
                              >
                                {isCurrentAction ? (
                                  <>
                                    <Loader2 size={10} className="animate-spin" />
                                    <span>Initiating...</span>
                                  </>
                                ) : (
                                  <>
                                    <Download size={10} />
                                    <span>Download Direct to NYX</span>
                                  </>
                                )}
                              </button>
                            )}

                            {isCompleted && !isResident && (
                              <button
                                onClick={() => handleRun(m.id)}
                                disabled={isCurrentAction || !!actionInProgress}
                                className="
                                  w-full py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                  bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:opacity-40
                                "
                              >
                                {isCurrentAction ? (
                                  <>
                                    <Loader2 size={10} className="animate-spin" />
                                    <span>Loading in Memory...</span>
                                  </>
                                ) : (
                                  <>
                                    <Play size={10} />
                                    <span>Load in Resident RAM</span>
                                  </>
                                )}
                              </button>
                            )}

                            {isResident && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleStop(m.id)}
                                  disabled={isCurrentAction || !!actionInProgress}
                                  className="
                                    flex-1 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                    bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 disabled:opacity-40
                                  "
                                >
                                  {isCurrentAction ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin" />
                                      <span>Evicting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Square size={10} />
                                      <span>Unload RAM</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => {
                                    selectModel?.(m.id);
                                    toast.success(`NYX Chatbot active model is now ${m.name}`);
                                  }}
                                  className="
                                    flex-1 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                    bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/25
                                  "
                                >
                                  <TerminalIcon size={10} />
                                  <span>Chat Now</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
           *  OLLAMA SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showLocal && (
            <section className="space-y-4 p-5 rounded-2xl bg-white/30 dark:bg-zinc-900/20 backdrop-blur-md border border-white/15 dark:border-white/5">
              <SectionHeader
                icon={<Server size={18} strokeWidth={1.5} />}
                title="Ollama"
                subtitle="Local model server"
              >
                {/* Inline URL config for Ollama */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/5 border border-border-strong/40">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30 shrink-0">URL</span>
                  <input
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={e => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                        setTimeout(() => {
                          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                        }, 100);
                      }
                    }}
                    className="
                      bg-transparent border-none text-[9px] font-mono text-primary
                      outline-none w-36 placeholder:text-muted-foreground/10
                    "
                  />
                  <button
                    onClick={() => setOllamaBaseUrl('http://localhost:11434')}
                    className="text-[6px] font-bold uppercase tracking-widest text-muted-foreground/20 hover:text-primary transition-colors shrink-0"
                  >
                    Reset
                  </button>
                </div>
                <StatusBadge status={ollamaStatus} />
                <button
                  onClick={onRefreshOllama}
                  disabled={ollamaStatus === 'loading'}
                  className="
                    p-2 rounded-lg bg-muted/15 border border-border/30
                    text-muted-foreground hover:text-primary hover:border-primary/30
                    transition-all disabled:opacity-40
                  "
                >
                  <RefreshCw size={14} strokeWidth={1.5} className={ollamaStatus === 'loading' ? 'animate-spin' : ''} />
                </button>
              </SectionHeader>

              {filteredOllama.length === 0 ? (
                <EmptyState
                  message="No Ollama models found"
                  hint="Start Ollama and pull a model with `ollama pull <model>`"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredOllama.map(m => (
                    <ModelCard
                      key={`ollama-${m.name}`}
                      name={m.name}
                      provider="ollama"
                      description={m.size ? `Local Ollama (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : 'Local Ollama model'}
                      specs={{
                        contextWindow: 'Dynamic',
                        maxOutput: 'Dynamic',
                        modality: 'Text'
                      }}
                      usage={usage['ollama']}
                      hasKey={true}
                      status={providerStatuses?.['ollama']}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
           *  LM STUDIO SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showLocal && (
            <section className="space-y-4 p-5 rounded-2xl bg-white/30 dark:bg-zinc-900/20 backdrop-blur-md border border-white/15 dark:border-white/5">
              <SectionHeader
                icon={<Server size={18} strokeWidth={1.5} />}
                title="LM Studio"
                subtitle="Local model directory server"
              >
                {/* Inline URL config for LM Studio */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/5 border border-border-strong/40">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30 shrink-0">URL</span>
                  <input
                    type="text"
                    value={lmStudioBaseUrl}
                    onChange={e => setLmStudioBaseUrl(e.target.value)}
                    placeholder="http://localhost:1234/v1"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                        setTimeout(() => {
                          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                        }, 100);
                      }
                    }}
                    className="
                      bg-transparent border-none text-[9px] font-mono text-primary
                      outline-none w-36 placeholder:text-muted-foreground/10
                    "
                  />
                  <button
                    onClick={() => setLmStudioBaseUrl('http://localhost:1234/v1')}
                    className="text-[6px] font-bold uppercase tracking-widest text-muted-foreground/20 hover:text-primary transition-colors shrink-0"
                  >
                    Reset
                  </button>
                </div>
                <StatusBadge status={lmStudioStatus} />
                <button
                  onClick={onRefreshLMStudio}
                  disabled={lmStudioStatus === 'loading'}
                  className="
                    p-2 rounded-lg bg-muted/15 border border-border/30
                    text-muted-foreground hover:text-primary hover:border-primary/30
                    transition-all disabled:opacity-40
                  "
                >
                  <RefreshCw size={14} strokeWidth={1.5} className={lmStudioStatus === 'loading' ? 'animate-spin' : ''} />
                </button>
              </SectionHeader>

              {filteredLMStudio.length === 0 ? (
                <EmptyState
                  message="No LM Studio models loaded"
                  hint="Load a model in LM Studio and ensure the server is running"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredLMStudio.map(m => (
                    <ModelCard
                      key={`lmstudio-${m.id}`}
                      name={m.id}
                      provider="lmstudio"
                      description="Currently loaded in LM Studio"
                      usage={usage['lmstudio']}
                      hasKey={true}
                      status={providerStatuses?.['lmstudio']}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
           *  CLOUD MODELS SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showCloud && (
            <section className="space-y-5 p-5 rounded-2xl bg-white/30 dark:bg-zinc-900/20 backdrop-blur-md border border-white/15 dark:border-white/5">
              <SectionHeader
                icon={<Globe size={18} strokeWidth={1.5} />}
                title="Cloud Models"
                subtitle="Ready to use online models"
              />

              {groupedCloud.map(([provider, models]) => (
                <div key={provider} className="space-y-4">
                  {/* Provider divider */}
                  <div className="flex items-center gap-3">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 shrink-0">
                      {provider}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-border/40 to-transparent" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {models.map(m => (
                      <ModelCard
                        key={m.id}
                        name={m.name}
                        provider={m.provider}
                        description={m.description}
                        specs={m.specs as any}
                        usage={usage[m.provider]}
                        hasKey={!!apiKeys[m.provider]}
                        status={providerStatuses?.[m.provider]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {filter === 'local' && !localModelsEnabled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 rounded-3xl bg-gradient-to-br from-white/30 via-white/10 to-transparent dark:from-[#181224]/30 dark:via-[#120B1C]/20 dark:to-transparent border border-white/20 dark:border-white/5 backdrop-blur-xl shadow-2xl flex flex-col items-center justify-center text-center max-w-xl mx-auto py-16"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-6 animate-pulse">
                <Server size={32} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Local Servers Disabled</h3>
              <p className="text-[11px] text-muted-foreground/80 mt-2 max-w-sm font-medium leading-relaxed">
                Connect third-party local engines like Ollama or LM Studio to integrate local llama, mistral, or qwen models into NYX.
              </p>
              <button
                onClick={() => {
                  setLocalModelsEnabled(true);
                  onRefreshOllama();
                  onRefreshLMStudio();
                }}
                className="mt-6 px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:scale-[1.03] active:scale-[0.97]"
              >
                Enable Local Servers
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const ModelRegistryView = React.memo(ModelRegistryViewComponent);
