import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Plus, RefreshCw, Globe, HardDrive, Info, X, Box, Monitor, Server
} from 'lucide-react';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { OllamaModel, ModelOption, ComparisonColumn, LMStudioModel } from '@/src/types';
import { Tooltip } from '../Tooltip';
import { UI_TEXT } from '../../lib/design-system/copy';
import { toast } from 'sonner';
import { useTokenUsage } from '@/src/context/TokenUsageContext';

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface ModelRegistryViewProps {
  columns: ComparisonColumn[];
  ollamaModels: OllamaModel[];
  ollamaStatus: 'idle' | 'loading' | 'error' | 'ok';
  ollamaError: string;
  lmStudioModels: LMStudioModel[];
  lmStudioStatus: 'idle' | 'loading' | 'error' | 'ok';
  lmStudioBaseUrl: string;
  setLmStudioBaseUrl: (url: string) => void;
  onRefreshOllama: () => void;
  onRefreshLMStudio: () => void;
  addColumn: (modelId: string) => void;
  apiKeys: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
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
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-strong">
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
  <div className="py-12 rounded-xl border border-dashed border-border/30 flex flex-col items-center justify-center text-center">
    <Box size={32} className="text-muted-foreground/15 mb-3" />
    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/80">{message}</p>
    <p className="text-[8px] text-muted-foreground/60 mt-1.5 max-w-[280px]">{hint}</p>
  </div>
);

/** Model card with hover effects and add button */
const ModelCard: React.FC<{
  name: string;
  provider: string;
  description: string;
  specs?: { contextWindow: string; maxOutput: string; modality: string };
  isDuplicate?: boolean;
  onAdd: () => void;
  usage?: { used: number; remaining: number };
  hasKey?: boolean;
  status?: 'online' | 'offline' | 'no-key';
}> = ({ name, provider, description, specs, isDuplicate, onAdd, usage, hasKey, status }) => {
  const [shaking, setShaking] = useState(false);

  const handleAdd = () => {
    if (isDuplicate) {
      setShaking(true);
      toast.error('A node is already created using this model — change it');
      setTimeout(() => setShaking(false), 500);
      return;
    }
    onAdd();
  };

  const providerLabel = provider === 'lmstudio' ? 'LM Studio' : provider;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`
        group relative p-3 rounded-[14px] border border-solid flex flex-col gap-2.5
        transform-gpu transition-all duration-500 overflow-hidden shadow-sm
        ${isDuplicate
          ? 'bg-destructive/5 border-destructive/20'
          : 'bg-card/60 backdrop-blur-3xl border-border-strong/40 hover:border-primary/40 hover:bg-card/80'
        }
      `}
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      {/* Provider badge + Add button */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`
              inline-block text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full
              ${isDuplicate ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}
            `}>
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
          <h4 className={`
            text-[12px] font-bold truncate leading-tight tracking-tight
            ${isDuplicate ? 'text-destructive' : 'text-foreground group-hover:text-primary transition-colors'}
          `}>
            {name}
          </h4>
        </div>

        <Tooltip content={isDuplicate ? 'Already Active' : UI_TEXT.registry.add}>
          <motion.button
            animate={shaking ? { x: [-3, 3, -3, 3, 0] } : {}}
            transition={{ duration: 0.35 }}
            onClick={handleAdd}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 shadow-sm
              ${isDuplicate
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-white opacity-0 group-hover:opacity-100'
              }
            `}
          >
            {isDuplicate ? <X size={14} strokeWidth={1.5} /> : <Plus size={14} strokeWidth={1.5} />}
          </motion.button>
        </Tooltip>
      </div>

      {/* Description */}
      <p className="text-[9px] text-muted-foreground/80 line-clamp-2 leading-relaxed font-medium">{description}</p>

      {/* Specs grid (cloud models only) */}
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
  columns,
  ollamaModels,
  ollamaStatus,
  ollamaError,
  lmStudioModels,
  lmStudioStatus,
  lmStudioBaseUrl,
  setLmStudioBaseUrl,
  onRefreshOllama,
  onRefreshLMStudio,
  addColumn,
  apiKeys,
  providerStatuses,
  ollamaBaseUrl,
  setOllamaBaseUrl,
}) => {
  const { usage } = useTokenUsage();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local'>('all');

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

  const showLocal = filter === 'all' || filter === 'local';
  const showCloud = filter === 'all' || filter === 'cloud';

  const columnModelIds = useMemo(
    () => new Set(columns.map(c => c.modelId)),
    [columns]
  );

  const isDuplicate = useCallback(
    (modelId: string) => columnModelIds.has(modelId),
    [columnModelIds]
  );

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <motion.div
      key="registry"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full w-full flex flex-col overflow-hidden"
    >
      {/* Padded inner wrapper — prevents content from touching sidebar edges */}
      <div className="flex flex-col h-full pt-2 px-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <header className="mb-3 flex flex-col md:flex-row md:items-center justify-between gap-5 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {UI_TEXT.registry.title}
              </h2>
            </div>
            <p className="text-muted-foreground/40 text-[9px] font-bold uppercase tracking-widest">
              Add models to your dashboard
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative group">
              <Search size={14} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/30 transition-colors group-focus-within:text-primary" />
              <input
                type="text"
                placeholder={UI_TEXT.registry.search}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="
                  bg-muted/10 border border-border-strong rounded-full
                  text-[10px] font-medium text-foreground
                  pl-10 pr-4 py-2 w-64
                  outline-none focus:border-primary/20 focus:bg-background/40
                  transition-all placeholder:text-muted-foreground/20 shadow-sm
                "
              />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-muted/10 p-1.5 rounded-full border border-border-strong shadow-sm">
              {(['all', 'cloud', 'local'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    px-5 py-1.5 rounded-full text-[8px] font-bold uppercase tracking-tight transition-all
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
          </div>
        </header>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-16 space-y-8 pr-2">

          {/* ════════════════════════════════════════════════════════════════
           *  OLLAMA SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showLocal && (
            <section className="space-y-4 p-5 rounded-[16px] bg-card/20 border border-border-strong">
              <SectionHeader
                icon={<Server size={18} strokeWidth={1.5} />}
                title="Ollama"
                subtitle="Local model server"
              >
                {/* Inline URL config for Ollama */}
                <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-muted/5 border border-border-strong">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30 shrink-0">URL</span>
                  <input
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={e => setOllamaBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="
                      bg-transparent border-none text-[10px] font-mono text-primary
                      outline-none w-40 placeholder:text-muted-foreground/10
                    "
                  />
                  <button
                    onClick={() => setOllamaBaseUrl('http://localhost:11434')}
                    className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/20 hover:text-primary transition-colors shrink-0"
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
                      description={`Local model · ${(m.size / 1e9).toFixed(2)} GB`}
                      isDuplicate={isDuplicate(m.name)}
                      onAdd={() => addColumn(m.name)}
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
            <section className="space-y-4 p-5 rounded-[16px] bg-card/20 border border-border-strong">
              <SectionHeader
                icon={<Monitor size={18} strokeWidth={1.5} />}
                title="LM Studio"
                subtitle="OpenAI-compatible local server"
              >
                {/* Inline URL config */}
                <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-muted/5 border border-border-strong">
                  <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30 shrink-0">URL</span>
                  <input
                    type="text"
                    value={lmStudioBaseUrl}
                    onChange={e => setLmStudioBaseUrl(e.target.value)}
                    placeholder="http://localhost:1234"
                    className="
                      bg-transparent border-none text-[10px] font-mono text-primary
                      outline-none w-40 placeholder:text-muted-foreground/10
                    "
                  />
                  <button
                    onClick={() => setLmStudioBaseUrl('http://localhost:1234')}
                    className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground/20 hover:text-primary transition-colors shrink-0"
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
                      isDuplicate={isDuplicate(m.id)}
                      onAdd={() => addColumn(m.id)}
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
            <section className="space-y-5 p-5 rounded-[16px] bg-card/20 border border-border-strong">
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
                        isDuplicate={isDuplicate(m.id)}
                        onAdd={() => addColumn(m.id)}
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
