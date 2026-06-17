// fallow-ignore-file code-duplication
import React, { useMemo, useEffect, useRef } from 'react';
import { SearchIcon as Search, CheckIcon as Check, InfoIcon as Info, XIcon as X, SparklesIcon as Sparkles, ZapIcon as Zap } from '@animateicons/react/lucide';
import { Bot, RefreshCw, HardDrive, Cpu, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { ModelOption } from '@src/types';
import { ProviderIcon, getProviderLabel } from '@src/shared/components/ui/ProviderIcon';
import { AIService } from '@src/core/services/ai.service';
import { useNyxStore, ExecutionMode } from '@src/shared/store/useNyxStore';
import { ModelStatusBadge } from '@src/features/model-registry/ModelStatusBadge';

interface Props {
  currentModelId?: string;
  allModels: ModelOption[];
  selectedProvider: string;
  searchTerm: string;
  onProviderChange: (p: string) => void;
  onSearchChange: (s: string) => void;
  onSelect: (modelId: string) => void;
  onClose?: () => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  isCoder?: boolean;
  onResetContext?: (modelId: string) => void;
  gatewayUrls?: Record<string, string>;
  dropdown?: boolean;
  alignDropdown?: 'top' | 'bottom';
}

// Structured provider order for the selector
const PROVIDER_ORDER = ['gemini', 'anthropic', 'openai', 'deepseek', 'openrouter', 'lmstudio', 'ollama'];

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

// Emil Kowalski stagger animations
const listContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.02,
    },
  },
};

const listItemVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as any,
      stiffness: 380,
      damping: 28,
      mass: 0.8,
    },
  },
};

export const ModelSelector: React.FC<Props> = ({
  currentModelId,
  allModels,
  selectedProvider,
  searchTerm,
  onProviderChange,
  onSearchChange,
  onSelect,
  onClose,
  providerStatuses,
  isCoder,
  onResetContext,
  gatewayUrls = {},
  dropdown = false,
  alignDropdown = 'top',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [localLibraryModels, setLocalLibraryModels] = React.useState<ModelOption[]>([]);
  const [expandedModelId, setExpandedModelId] = React.useState<string | null>(null);
  const executionMode = useNyxStore((s) => s.executionMode);
  const setExecutionMode = useNyxStore((s) => s.setExecutionMode);

  React.useEffect(() => {
    let active = true;
    const loadLocalModels = async () => {
      const isLocalEngineEnabled = localStorage.getItem('llm_ref_local_models_enabled') === 'true';
      try {
        const [ollamaRes, lmstudioRes] = await Promise.allSettled([
          AIService.fetchWithAuth('/api/v1/nyx/local-models/ollama/models'),
          AIService.fetchWithAuth('/api/v1/models/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'lmstudio' })
          })
        ]);

        let combinedModels: any[] = [];

        if (ollamaRes.status === 'fulfilled' && ollamaRes.value.ok) {
          try {
            const oData = await ollamaRes.value.json();
            const ollamaModels = (oData.models || oData || []).map((m: any) => ({
              id: m.name || m,
              name: (m.name || m).replace('ollama/', ''),
              provider: 'ollama',
              description: 'Ollama local model',
              specs: { contextWindow: '8K', trainingData: 'N/A', maxOutput: 'N/A', modality: 'Text' },
              status: 'completed'
            }));
            combinedModels = [...combinedModels, ...ollamaModels];
          } catch (e) {}
        }

        if (lmstudioRes.status === 'fulfilled' && lmstudioRes.value.ok) {
          try {
            const lData = await lmstudioRes.value.json();
            const lmstudioModels = (lData.models || []).map((m: any) => {
              const idStr = typeof m === 'string' ? m : (m.id || m.key || m.name || JSON.stringify(m));
              const nameStr = typeof m === 'string' ? m : (m.name || m.display_name || m.id || m.key || JSON.stringify(m));
              return {
                id: idStr,
                name: nameStr.replace('lmstudio/', ''),
              provider: 'lmstudio',
              description: 'LM Studio local model',
              specs: { contextWindow: '8K', trainingData: 'N/A', maxOutput: 'N/A', modality: 'Text' },
              status: 'completed'
              };
            });
            combinedModels = [...combinedModels, ...lmstudioModels];
          } catch (e) {}
        }

        if (active) {
          setLocalLibraryModels(combinedModels);
        }
      } catch (err: any) {
        console.error('[ModelSelector] Failed to load local models:', err);
      }
    };
    loadLocalModels();
    const interval = setInterval(loadLocalModels, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!dropdown || !onClose) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdown, onClose]);

  const getGatewayUrl = (provider: string): string => {
    return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
  };

  // Combine all models for grouping logic
  const mergedModels = useMemo(() => {
    const seenIds = new Set();

    // Filter out static presets if we successfully loaded active models
    const filteredAllModels = allModels;
    const nativeSource = localLibraryModels;

    const allSources = [...filteredAllModels, ...nativeSource];
    return allSources.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels, localLibraryModels]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {
      'gemini': [],
      'anthropic': [],
      'openai': [],
      'deepseek': [],
      'openrouter': [],
      'lmstudio': [],
      'ollama': [],
    };
    mergedModels.forEach((model) => {
      const p = model.provider || 'unknown';
      if (!groups[p]) groups[p] = [];
      groups[p].push(model);
    });
    return groups;
  }, [mergedModels]);

  // Sort providers in structured order
  const sortedProviders = useMemo(() => {
    const providers = Object.keys(groupedModels);
    return providers.sort((a, b) => {
      const aIdx = PROVIDER_ORDER.indexOf(a);
      const bIdx = PROVIDER_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [groupedModels]);

  const filteredModels = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const modelsForProvider = groupedModels[selectedProvider] || [];
    return modelsForProvider.filter(
      (m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
    );
  }, [groupedModels, selectedProvider, searchTerm]);

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: filteredModels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 5,
  });

  const dropdownClassName =
    alignDropdown === 'bottom'
      ? 'absolute top-full left-0 mt-3.5 z-[500] w-[95vw] sm:w-[520px] max-w-[520px]'
      : 'absolute bottom-full left-0 mb-3.5 z-[500] w-[95vw] sm:w-[520px] max-w-[520px]';

  const transformOrigin = dropdown
    ? alignDropdown === 'bottom'
      ? 'top left'
      : 'bottom left'
    : 'center';

  const entryY = alignDropdown === 'bottom' ? -12 : 12;
  const exitY = alignDropdown === 'bottom' ? -8 : 8;

  return (
    <div
      ref={containerRef}
      className={
        dropdown ? dropdownClassName : 'fixed inset-0 z-[500] flex items-center justify-center p-4'
      }
    >
      {dropdown ? null : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/65 backdrop-blur-sm cursor-pointer"
        />
      )}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: entryY }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          transition: {
            duration: 0.2,
            ease: [0.23, 1, 0.32, 1],
          },
        }}
        exit={{
          opacity: 0,
          scale: 0.95,
          y: exitY,
          transition: {
            duration: 0.15,
            ease: [0.23, 1, 0.32, 1],
          },
        }}
        style={{ transformOrigin }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[520px] bg-popover border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col max-h-[60vh] cursor-default"
      >
        {/* Top Edge Highlight */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        {/* Main Content Split Area */}
        <div className="flex flex-1 min-h-0 gap-1.5 p-1.5 overflow-hidden">
          {/* Left Box: Providers (Gateways) */}
          <div className="w-[clamp(100px,25%,120px)] shrink-0 bg-muted/30 border border-border rounded-md flex flex-col p-1 space-y-0.5 overflow-y-auto custom-scrollbar">
            <span className="px-1 py-0.5 text-[6.5px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Gateways
            </span>
            {sortedProviders.map((provider) => {
              const status = providerStatuses?.[provider];
              const isActive = selectedProvider === provider;

              return (
                <motion.button
                  key={provider}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => {
                    onProviderChange(provider);
                    onSearchChange('');
                  }}
                  className={`
                    w-full flex items-center justify-between px-1.5 py-1 rounded-md transition-all duration-300 group cursor-pointer border
                    ${
                      isActive
                        ? status === 'no-key'
                          ? 'bg-muted border-border text-muted-foreground font-bold'
                          : 'bg-primary/5 border-primary/10 text-primary font-bold'
                        : 'hover:bg-muted/50 border-transparent text-muted-foreground hover:text-foreground'
                    }
                  `}
                >
                  <span className="flex-1 text-left text-[8.2px] font-bold truncate leading-none">
                    {getProviderLabel(provider)}
                  </span>

                  {/* Status Indicator Glow Dot */}
                  {providerStatuses && (
                    <div className="relative flex items-center shrink-0 ml-1">
                      <div
                        className={`w-1.5 h-1.5 rounded-md ${
                          status === 'online'
                            ? 'bg-emerald-400 animate-pulse'
                            : status === 'no-key'
                              ? 'bg-zinc-700'
                              : 'bg-zinc-800'
                        }`}
                      />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Right Box: Models Grid */}
          <div className="flex-1 bg-muted/10 border border-border rounded-md overflow-hidden flex flex-col">
            {/* Context Sub-header */}
            <div className="p-1.5 px-2 border-b border-border flex items-center justify-between bg-muted/20">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Units
              </span>
              <div className="px-1.5 py-0.5 rounded-md bg-muted border border-border text-[7px] font-mono font-black text-foreground">
                {filteredModels.length.toString().padStart(2, '0')}
              </div>
            </div>

            {/* Scrollable list of models */}
            <div ref={parentRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center space-y-2 py-6">
                  <div className="w-8 h-8 rounded-md bg-muted/30 flex items-center justify-center border border-dashed border-border">
                    <Bot className="w-4 h-4 opacity-25" />
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-35">
                    None found
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const model = filteredModels[virtualItem.index];
                    const isSelected = currentModelId === model.id;
                    const isNoKey = providerStatuses?.[model.provider] === 'no-key';
                    const isOnline = providerStatuses?.[model.provider] === 'online';
                    const isExpanded = expandedModelId === model.id;

                    return (
                      <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualItem.start}px)`,
                          paddingBottom: '4px',
                        }}
                      >
                        <motion.div
                          variants={listItemVariants}
                          className={`
                            flex flex-col gap-1.5 p-1.5 rounded-md transition-all duration-300 border text-left group relative overflow-hidden h-full
                            ${
                              isSelected
                                ? isNoKey
                                  ? 'bg-muted border-border'
                                  : 'bg-primary/5 border-primary/10'
                                : 'bg-transparent border-transparent hover:bg-muted/40 hover:border-border'
                            }
                          `}
                        >
                          <div 
                            className="flex items-center justify-between gap-1.5 cursor-pointer"
                            onClick={() => {
                              onSelect((model as any).realId || model.id);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <h4
                                  className={`text-[9px] font-bold truncate leading-none ${
                                    isSelected ? 'text-foreground font-black' : 'text-foreground/80'
                                  } ${
                                    (model as any).status === 'deprecated'
                                      ? 'line-through opacity-60'
                                      : ''
                                  }`}
                                >
                                  {model.name}
                                </h4>

                                {/* Model lifecycle status badge (preview / deprecated / alias) */}
                                {(model as any).status && (model as any).status !== 'ga' && (
                                  <ModelStatusBadge
                                    status={(model as any).status}
                                    shutdownDate={(model as any).shutdownDate}
                                    compact
                                  />
                                )}

                                {/* Provider connection status tag */}
                                {providerStatuses && providerStatuses[model.provider] && (
                                  <div
                                    className={`
                                    text-[5.5px] font-black uppercase tracking-wider px-1 py-0.5 rounded-[3px] border shrink-0
                                    ${
                                      isOnline
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : isNoKey
                                          ? 'bg-muted border-border text-muted-foreground'
                                          : 'bg-muted/50 border-border text-muted-foreground/60'
                                    }
                                  `}
                                  >
                                    {isOnline ? 'Online' : isNoKey ? 'Auth' : 'Off'}
                                  </div>
                                )}

                                {/* Inline Monospace Specs Badge */}
                                {model.specs?.contextWindow && (
                                  <span className="text-[6px] font-mono font-bold text-muted-foreground/50 bg-muted px-1 py-0.5 rounded border border-border shrink-0 ml-auto leading-none">
                                    {model.specs.contextWindow}
                                  </span>
                                )}
                              </div>

                              <p className="text-[7px] font-mono text-muted-foreground/60 truncate uppercase tracking-tight mt-0.5 leading-none pr-6">
                                {model.description || model.id}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Info Button */}
                              {(model.features || model.pros || model.cons) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedModelId(isExpanded ? null : model.id);
                                  }}
                                  className={`p-1 rounded transition-colors ${
                                    isExpanded 
                                      ? 'bg-primary/20 text-primary' 
                                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                  }`}
                                  title="View features"
                                >
                                  <Info size={12} />
                                </button>
                              )}
                              
                              {isSelected && (
                                <div
                                  className={`w-3.5 h-3.5 rounded-md flex items-center justify-center shrink-0 ml-0.5 ${isNoKey ? 'bg-muted border border-border text-muted-foreground' : 'bg-primary border border-primary/20 text-primary-foreground'}`}
                                >
                                  <Check
                                    className={`w-2 h-2 ${isNoKey ? 'text-muted-foreground' : 'text-primary-foreground'}`}
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Expanded Details */}
                          <AnimatePresence>
                            {isExpanded && (model.features || model.pros || model.cons) && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-2 mt-1 border-t border-border/30 flex flex-col gap-2">
                                  {model.features && model.features.length > 0 && (
                                    <div>
                                      <span className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/80">Features</span>
                                      <ul className="list-disc list-outside ml-3 mt-0.5 space-y-0.5">
                                        {model.features.map((f: string, i: number) => (
                                          <li key={i} className="text-[8px] text-foreground/80 leading-snug">{f}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {model.pros && model.pros.length > 0 && (
                                    <div>
                                      <span className="text-[7px] font-black uppercase tracking-widest text-emerald-500/80">Good</span>
                                      <ul className="list-disc list-outside ml-3 mt-0.5 space-y-0.5">
                                        {model.pros.map((p: string, i: number) => (
                                          <li key={i} className="text-[8px] text-emerald-500/90 leading-snug">{p}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {model.cons && model.cons.length > 0 && (
                                    <div>
                                      <span className="text-[7px] font-black uppercase tracking-widest text-destructive/80">Bad</span>
                                      <ul className="list-disc list-outside ml-3 mt-0.5 space-y-0.5">
                                        {model.cons.map((c: string, i: number) => (
                                          <li key={i} className="text-[8px] text-destructive/90 leading-snug">{c}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Execution Mode Selector */}
        <div className="p-1.5 border-t border-border flex items-center gap-1 bg-muted/20">
          <span className="px-1 text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground shrink-0 w-[95px]">
            Execution
          </span>
          <div className="flex-1 flex gap-1 bg-background p-0.5 rounded-md border border-border">
            {(['auto', 'standard', 'parallel', 'ensemble', 'ab-test'] as ExecutionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setExecutionMode(mode)}
                className={`flex-1 py-1 rounded-md text-[7px] font-black uppercase tracking-wider transition-all ${
                  executionMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {mode.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* CSS Scrollbar Overrides */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }
      `,
        }}
      />
    </div>
  );
};
