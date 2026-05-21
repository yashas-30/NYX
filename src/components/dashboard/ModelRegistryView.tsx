// Forced HMR re-transpilation trigger comment
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Globe, Box, Server, Terminal as TerminalIcon, Settings as SettingsIcon
} from 'lucide-react';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { OllamaModel, ModelOption, LMStudioModel } from '@/src/types';
import { useTokenUsage } from '@/src/context/TokenUsageContext';

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface ModelRegistryViewProps {
  models?: Record<'open' | 'claude' | 'nyx', string>;
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
  apiKeys,
  providerStatuses,
  ollamaBaseUrl,
  setOllamaBaseUrl,
  activeMode,
  setActiveMode,
}) => {
  const { usage } = useTokenUsage();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local'>('all');
  const [localModelsEnabled, setLocalModelsEnabled] = useState(false);

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
      className="h-full w-full p-[2vw] flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl overflow-hidden shadow-xl relative">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/10 dark:bg-black/10 backdrop-blur-sm">
          <div className="flex items-center gap-1 bg-black/10 dark:bg-white/5 p-0.5 rounded-xl border border-white/10 dark:border-white/5">
            <button 
              onClick={() => setActiveMode?.('coder')} 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'coder' ? 'bg-[#181224]/85 dark:bg-[#120B1C]/90 text-purple-400 border border-purple-500/20 shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              <TerminalIcon size={12} />
              <span>NYX 2.0</span>
            </button>
            <button 
              onClick={() => setActiveMode?.('registry')} 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'registry' ? 'bg-primary text-primary-foreground shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              <Box size={12} />
              <span>Models</span>
            </button>
            <button 
              onClick={() => setActiveMode?.('settings')} 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'settings' ? 'bg-primary text-primary-foreground shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              <SettingsIcon size={12} />
              <span>Settings</span>
            </button>
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
              {(['all', 'cloud', 'local'] as const).map(f => (
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
                  {f}
                </button>
              ))}
            </div>

            {/* Local Models Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/10 border border-border-strong">
              <Server size={10} className={localModelsEnabled ? 'text-primary' : 'text-muted-foreground/30'} />
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">Local</span>
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
        </div>
      </div>
    </motion.div>
  );
};

export const ModelRegistryView = React.memo(ModelRegistryViewComponent);
