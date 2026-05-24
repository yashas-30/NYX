// Forced HMR re-transpilation trigger comment
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Globe, Box, Cpu, Download, AlertCircle, Loader2, Play, Square, Terminal as TerminalIcon, X, Check, Trash2, Zap
} from 'lucide-react';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { getProviderLabel } from '../ui/ProviderIcon';
import { ModelOption } from '@/src/types';
import { useTokenUsage } from '@/src/context/TokenUsageContext';
import { toast } from '@/src/components/ui/sonner';
import { AIService } from '@/src/core/services/ai.service';

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface ModelRegistryViewProps {
  models?: Record<'nyx', string>;
  selectModel?: (modelId: string) => void;
  apiKeys: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ───────────────────────────────────────────────────────────────────────────── */

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
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{subtitle}</p>
      </div>
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);

/** Empty state for when no models are found */
const EmptyState: React.FC<{ message: string; hint: string }> = ({ message, hint }) => (
  <div className="py-12 rounded-2xl border border-dashed border-white/15 dark:border-white/5 flex flex-col items-center justify-center text-center bg-white/10 dark:bg-white/5">
    <Box size={32} className="text-muted-foreground/15 mb-3" />
    <p className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">{message}</p>
    <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[280px]">{hint}</p>
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
  const providerLabel = provider;

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
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {providerLabel}
            </span>
            {status && (
              <span className={`
                text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border
                ${status === 'online' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                  status === 'offline' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                  'bg-amber-500/10 text-amber-500 border-amber-500/20'}
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
      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium">{description}</p>

      {/* Specs grid */}
      {(specs || (usage && hasKey)) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 border-t border-border/30">
          {specs && (
            <>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Context</span>
                <span className="text-[10px] font-mono font-bold text-foreground/80">{specs.contextWindow}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Modality</span>
                <span className="text-[10px] font-mono font-bold text-foreground/80">{specs.modality}</span>
              </div>
            </>
          )}
          {usage && hasKey && (
            <>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-primary/75">Used</span>
                <span className="text-[10px] font-mono font-bold text-primary/80">{(usage.used / 1000).toFixed(1)}k</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/75">Remaining</span>
                <span className="text-[10px] font-mono font-bold text-emerald-400">{(usage.remaining / 1000).toFixed(1)}k</span>
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
          <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">Quota Reached</span>
        </motion.div>
      )}
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Main Registry View
 * ───────────────────────────────────────────────────────────────────────────── */

const ModelRegistryViewComponent: React.FC<ModelRegistryViewProps> = ({
  selectModel,
  apiKeys,
  providerStatuses,
  activeMode,
  setActiveMode,
  sidebarOpen = true,
}) => {
  const { usage } = useTokenUsage();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'nyx' | 'cloud'>('all');

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
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  const fetchNativeModels = useCallback(async () => {
    try {
      const res = await AIService.fetchWithAuth('/api/nyx/local-models');
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

  const handleCustomUrlDownload = async () => {
    if (!customUrl.trim()) {
      toast.error('Please enter a valid URL.');
      return;
    }
    if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
      toast.error('URL must start with http:// or https://');
      return;
    }
    
    setActionInProgress(customUrl.trim());
    try {
      const res = await AIService.fetchWithAuth('/api/nyx/local-models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: customUrl.trim() })
      });
      if (res.ok) {
        toast.success('Custom URL download started successfully.');
        setCustomUrl('');
        setShowDownloadModal(false);
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Download failed: ${errData.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDownload = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      const res = await AIService.fetchWithAuth('/api/nyx/local-models/download', {
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
      let settings = {};
      const savedSettings = localStorage.getItem('nyx_model_settings');
      if (savedSettings) {
        try {
          settings = JSON.parse(savedSettings);
        } catch {}
      }

      const res = await AIService.fetchWithAuth('/api/nyx/local-models/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, settings })
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
      const res = await AIService.fetchWithAuth('/api/nyx/local-models/stop', {
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

  const handleDelete = async (modelId: string, modelName: string) => {
    if (!confirm(`Delete "${modelName}" from disk? This cannot be undone.`)) return;
    setActionInProgress(modelId);
    try {
      const res = await AIService.fetchWithAuth('/api/nyx/local-models/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      if (res.ok) {
        toast.success(`"${modelName}" removed from disk.`);
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Delete failed: ${errData.error}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const query = search.toLowerCase();

  /* ── Filtered model lists ─────────────────────────────────────────────── */

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

  const groupedLocalPresets = useMemo<[string, any[]][]>(() => {
    const grouped = nativeModels.reduce((acc, m) => {
      const prov = m.provider || 'local';
      if (!acc[prov]) acc[prov] = [];
      acc[prov].push(m);
      return acc;
    }, {} as Record<string, any[]>);

    return (Object.entries(grouped) as [string, any[]][]).sort(([a], [b]) => {
      if (a === 'google') return -1;
      if (b === 'google') return 1;
      return a.localeCompare(b);
    });
  }, [nativeModels]);

  const showNyx = filter === 'all' || filter === 'nyx';
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
        <header className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 ${!sidebarOpen ? 'pl-14' : ''} border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/5 dark:bg-black/10 backdrop-blur-md transition-all duration-300`}>
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
                  text-[11px] font-medium text-foreground
                  pl-8 pr-3 py-1.5 w-40 sm:w-48
                  outline-none focus:border-primary/20
                  transition-all placeholder:text-muted-foreground/20 shadow-sm
                "
              />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-white/30 dark:bg-zinc-900/30 backdrop-blur-sm p-1 rounded-full border border-white/15 dark:border-white/5 shadow-sm">
              {(['all', 'nyx', 'cloud'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-tight transition-all
                    ${filter === f
                      ? 'bg-primary text-white shadow-lg'
                      : 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5'
                    }
                  `}
                >
                  {f === 'all' ? 'All' : f === 'nyx' ? 'NYX Native' : 'Cloud'}
                </button>
              ))}
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
                <div className="flex flex-wrap items-center gap-3">
                  {/* Direct RAM Load Status Badge */}
                  <div className={`
                    inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight
                    ${activeNativeId 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'}
                  `}>
                    <div className={`
                      w-1.5 h-1.5 rounded-full
                      ${activeNativeId ? 'bg-emerald-400 animate-ping' : 'bg-zinc-400'}
                    `} />
                    {activeNativeId ? 'Model Resident in RAM' : 'No Model Loaded'}
                  </div>

                  {/* Browse Presets / Download button */}
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setShowDownloadModal(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 border border-purple-500/20 hover:border-purple-500/40 text-[11px] font-black uppercase tracking-wider text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all cursor-pointer"
                  >
                    <Download size={10} />
                    <span>Browse &amp; Download</span>
                  </motion.button>
                </div>
              </SectionHeader>

              {/* Only show downloaded or actively-downloading models in the library */}
              {(() => {
                const installedModels = nativeModels.filter(
                  m => m.status === 'completed' || m.status === 'downloading' || activeNativeId === m.id
                );

                if (installedModels.length === 0) {
                  return (
                    <div className="py-10 rounded-2xl border border-dashed border-purple-500/15 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <Download size={16} className="text-purple-400" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">No models installed</p>
                        <p className="text-[8px] text-muted-foreground/40 mt-1 font-medium">Click <span className="text-purple-400 font-bold">Browse &amp; Download</span> to add models to your library.</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {installedModels.map(m => {
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
                            <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              NYX Native
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isResident && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  Resident RAM
                                </span>
                              )}
                              {isCompleted && !isResident && (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 dark:text-zinc-300 border border-zinc-500/20">
                                  Ready
                                </span>
                              )}
                              {isDownloading && (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                                  Downloading
                                </span>
                              )}
                            </div>
                          </div>

                          <h4 className="text-[12px] font-black tracking-tight text-foreground group-hover:text-purple-400 transition-colors">
                            {m.name}
                          </h4>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium mt-1">
                            {m.description}
                          </p>

                          {/* Technical attributes */}
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-border/30">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">GGUF File Size</span>
                              <span className="text-[10px] font-mono font-extrabold text-foreground/80">{m.size}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">RAM / VRAM Required</span>
                              <span className="text-[10px] font-mono font-extrabold text-purple-400">{m.vramRequired ? `${m.vramRequired} + ` : ''}{m.ramRequired}</span>
                            </div>
                          </div>
                        </div>

                        {/* Interactive operations panel */}
                        <div className="mt-2.5 pt-2.5 border-t border-border/30">
                          {isDownloading && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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
                              <div className="text-[10px] font-medium text-muted-foreground/80 text-right">
                                {progress.totalBytes > 0 
                                  ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB`
                                  : 'Negotiating HTTP download streams...'}
                              </div>
                            </div>
                          )}

                          {m.status === 'failed' && (
                            <div className="p-2 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-semibold text-red-400 flex items-start gap-1.5">
                              <AlertCircle size={10} className="shrink-0 mt-0.5" />
                              <span>{progress.error || 'Download failed. Please check network connections.'}</span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1.5 mt-1">
                            {isIdle && (
                              <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => handleDownload(m.id)}
                                disabled={isCurrentAction || !!actionInProgress}
                                className="
                                  w-full py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                  bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 disabled:opacity-40 cursor-pointer
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
                              </motion.button>
                            )}

                            {isCompleted && !isResident && (
                              <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => handleRun(m.id)}
                                disabled={isCurrentAction || !!actionInProgress}
                                className="
                                  w-full py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                  bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:opacity-40 cursor-pointer
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
                              </motion.button>
                            )}

                            {isResident && (
                              <div className="flex gap-2">
                                <motion.button
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() => handleStop(m.id)}
                                  disabled={isCurrentAction || !!actionInProgress}
                                  className="
                                    flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                    bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 disabled:opacity-40 cursor-pointer
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
                                </motion.button>

                                <motion.button
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() => {
                                    selectModel?.(m.id);
                                    toast.success(`NYX Chatbot active model is now ${m.name}`);
                                  }}
                                  className="
                                    flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                    bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/25 cursor-pointer
                                  "
                                >
                                  <TerminalIcon size={10} />
                                  <span>Chat Now</span>
                                </motion.button>
                              </div>
                            )}

                            {/* Delete button — only show when downloaded and not currently downloading */}
                            {(isCompleted || isResident) && (
                              <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleDelete(m.id, m.name)}
                                disabled={isCurrentAction || !!actionInProgress}
                                className="
                                  w-full py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all mt-1
                                  bg-red-500/8 hover:bg-red-500/15 text-red-400/70 hover:text-red-400 border border-red-500/10 hover:border-red-500/25 disabled:opacity-40 cursor-pointer
                                "
                              >
                                <Trash2 size={9} />
                                <span>Delete from Disk</span>
                              </motion.button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                    })}
                  </div>
                );
              })()}
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
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/80 shrink-0">
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
        </div>
      </div>

      {/* Download GGUF Presets Modal Window */}
      <AnimatePresence>
        {showDownloadModal && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDownloadModal(false)}
              className="absolute inset-0 bg-[#0b0b0c]/85 backdrop-blur-md cursor-pointer"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                transition: { type: "spring", stiffness: 350, damping: 30 }
              }}
              exit={{ 
                opacity: 0, 
                scale: 0.95, 
                y: 15,
                transition: { duration: 0.18, ease: "easeOut" }
              }}
              className="relative w-full max-w-4xl bg-[#18181b]/95 border border-white/[0.08] rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh] backdrop-blur-3xl overflow-hidden cursor-default z-[610]"
            >
              {/* Modal Header */}
              <div className="p-4 px-6 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs font-black tracking-[0.25em] text-purple-400 uppercase">Local Model Directory</h3>
                  <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-widest mt-0.5">World's most popular open-source models — download &amp; run locally in NYX</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowDownloadModal(false)}
                  className="p-1.5 rounded-xl text-muted-foreground/45 hover:text-foreground hover:bg-white/5 transition-all cursor-pointer"
                >
                  <X size={14} />
                </motion.button>
              </div>

              {/* Custom GGUF URL Download Input */}
              <div className="px-6 py-3.5 border-b border-white/[0.06] bg-white/[0.01] flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <div className="w-full sm:flex-1 relative">
                  <input
                     type="text"
                     placeholder="Paste HuggingFace GGUF direct URL (e.g., https://huggingface.co/.../*.gguf)..."
                     value={customUrl}
                     onChange={e => setCustomUrl(e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-[10px] text-foreground focus:outline-none focus:border-purple-500/50 transition-all placeholder:text-muted-foreground/35"
                  />
                </div>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleCustomUrlDownload}
                  disabled={actionInProgress !== null}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 shrink-0"
                >
                  Download URL
                </motion.button>
              </div>

              {/* Scrollable list grouped by provider */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {groupedLocalPresets.map(([provider, providerModels]) => (
                  <div key={provider} className="space-y-4">
                    {/* Provider divider matching cloud models library */}
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-black uppercase tracking-[0.3em] text-purple-400 shrink-0">
                        {getProviderLabel(provider)}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-[#9b4dff]/30 to-transparent" />
                    </div>
                    
                    {/* responsive grid matching main library grids */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {providerModels.map(m => {
                        const isResident = activeNativeId === m.id;
                        const isDownloading = m.status === 'downloading';
                        const isCompleted = m.status === 'completed';
                        const isIdle = m.status === 'idle' || m.status === 'failed';
                        const progress = m.progress || { progressPercentage: 0, speedMbps: 0, bytesDownloaded: 0, totalBytes: 0 };
                        const isCurrentAction = actionInProgress === m.id;

                        return (
                          <motion.div
                            key={`modal-preset-${m.id}`}
                            whileHover={{ y: -2, scale: 1.01 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            className={`
                              group relative p-3.5 rounded-2xl border border-solid flex flex-col justify-between gap-3 transform-gpu transition-all duration-500 overflow-hidden shadow-sm
                              ${isResident
                                ? 'bg-[#181224]/80 border-[#9b4dff]/45 shadow-[0_0_20px_rgba(155,77,255,0.15)] dark:bg-[#120B1C]/90'
                                : 'bg-white/40 dark:bg-zinc-900/30 border-white/20 dark:border-white/5 hover:border-purple-500/30 hover:bg-white/60 dark:hover:bg-zinc-800/40'
                              }
                            `}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                  {m.featured && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      <Zap size={7} /> Featured
                                    </span>
                                  )}
                                  <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    GGUF
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1.5">
                                  {isResident && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      Resident
                                    </span>
                                  )}
                                  {isCompleted && !isResident && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                      Ready
                                    </span>
                                  )}
                                  {isDownloading && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                                      Downloading
                                    </span>
                                  )}
                                </div>
                              </div>

                              <h5 className="text-[12px] font-bold leading-tight tracking-tight text-foreground group-hover:text-purple-400 transition-colors">
                                {m.name}
                              </h5>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium mt-1">
                                {m.description}
                              </p>

                              {/* Specs grid — 4 cells */}
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2.5 border-t border-border/30 mt-2">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Parameters</span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">{m.paramCount || '—'}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Quantization</span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">{m.quantization || '—'}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Context</span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">{m.contextLength || '—'}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">File Size</span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">{m.size}</span>
                                </div>
                                <div className="flex flex-col col-span-2">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">RAM / VRAM Required</span>
                                  <span className="text-[10px] font-mono font-bold text-purple-400">{m.vramRequired ? `${m.vramRequired} + ` : ''}{m.ramRequired}</span>
                                </div>
                              </div>
                            </div>

                            {/* Download Action */}
                            <div className="mt-2.5 pt-2.5 border-t border-border/30">
                              {isDownloading && (
                                <div className="space-y-1.5 mb-2">
                                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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
                                  <div className="text-[10px] font-medium text-muted-foreground/80 text-right">
                                    {progress.totalBytes > 0 
                                      ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB`
                                      : 'Negotiating HTTP download streams...'}
                                  </div>
                                </div>
                              )}

                              {isIdle && (
                                <motion.button
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() => handleDownload(m.id)}
                                  disabled={isCurrentAction || !!actionInProgress}
                                  className="
                                    w-full py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                    bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 disabled:opacity-40 cursor-pointer
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
                                      <span>Download to NYX</span>
                                    </>
                                  )}
                                </motion.button>
                              )}

                              {isCompleted && (
                                <div className="flex flex-col gap-1.5">
                                  <div className="py-1.5 px-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                                    <Check size={10} />
                                    <span>Ready on Device</span>
                                  </div>
                                  <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleDelete(m.id, m.name)}
                                    disabled={isCurrentAction || !!actionInProgress}
                                    className="
                                      w-full py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                      bg-red-500/8 hover:bg-red-500/18 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 disabled:opacity-40 cursor-pointer
                                    "
                                  >
                                    <Trash2 size={9} />
                                    <span>Delete from Disk</span>
                                  </motion.button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const ModelRegistryView = React.memo(ModelRegistryViewComponent);
