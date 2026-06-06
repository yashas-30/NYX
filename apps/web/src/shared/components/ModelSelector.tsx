// fallow-ignore-file code-duplication
import React, { useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Check,
  Info,
  Bot,
  RefreshCw,
  X,
  Sparkles,
  Zap,
  HardDrive,
  Cpu,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { ModelOption } from '@src/types';
import { ProviderIcon, getProviderLabel } from '@src/shared/components/ui/ProviderIcon';
import { AIService } from '@src/core/services/ai.service';
import { useNyxStore, ExecutionMode } from '@src/shared/store/useNyxStore';

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
const PROVIDER_ORDER = ['gemini', 'nyx-native'];

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
  const executionMode = useNyxStore((s) => s.executionMode);
  const setExecutionMode = useNyxStore((s) => s.setExecutionMode);

  React.useEffect(() => {
    let active = true;
    const loadLocalModels = async () => {
      if (localStorage.getItem('llm_ref_local_models_enabled') !== 'true') {
        if (active) {
          setLocalLibraryModels([]);
        }
        return;
      }
      try {
        const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models');
        if (res.ok) {
          const data = await res.json();
          if (active && data.models && Array.isArray(data.models)) {
            const completed = data.models
              .filter((m: any) => m.status === 'completed' || m.status === 'downloading')
              .map((m: any) => ({
                id: m.id,
                name: m.name,
                provider: 'nyx-native',
                description: m.description || `Local GGUF model (${m.size || ''})`,
                specs: {
                  contextWindow: m.contextLength || '8K',
                  trainingData: 'N/A',
                  maxOutput: 'N/A',
                  modality: 'Text',
                },
                status: m.status,
              }));
            setLocalLibraryModels(completed);
          }
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
    const filteredAllModels = allModels.filter((m) => m.provider !== 'nyx-native');
    const nativeSource = localLibraryModels;

    const allSources = [...filteredAllModels, ...nativeSource];
    return allSources.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels, localLibraryModels]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, any[]> = {
      'nyx-native': [],
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
      ? 'absolute top-full left-0 mt-3.5 z-[500] w-[300px]'
      : 'absolute bottom-full left-0 mb-3.5 z-[500] w-[300px]';

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
        className="relative w-full max-w-[300px] bg-popover border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col max-h-[35vh] cursor-default"
      >
        {/* Top Edge Highlight */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        {/* Main Content Split Area */}
        <div className="flex flex-1 min-h-0 gap-1.5 p-1.5 overflow-hidden">
          {/* Left Box: Providers (Gateways) */}
          <div className="w-[85px] shrink-0 bg-muted/30 border border-border rounded-md flex flex-col p-1 space-y-0.5 overflow-y-auto custom-scrollbar">
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
              {selectedProvider === 'nyx-native' && filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-center p-3 py-6 space-y-3">
                  <div className="w-10 h-10 rounded-md bg-[#FF3366]/10 flex items-center justify-center border border-[#FF3366]/20 shadow-inner">
                    <Cpu className="w-5 h-5 text-[#FF3366] animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white">
                      No Local Models
                    </p>
                    <p className="text-[7.5px] text-zinc-500 leading-normal max-w-[150px] mx-auto">
                      Run lightweight GGUF models on your own CPU & GPU entirely on-device.
                    </p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (onClose) onClose();
                      if (typeof (window as any).nyxSwitchActiveMode === 'function') {
                        (window as any).nyxSwitchActiveMode('registry');
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-[#FF3366] text-black text-[8px] font-black uppercase tracking-wider shadow-sm hover:bg-[#FF3366]/90 transition-all cursor-pointer"
                  >
                    Go to Registry
                  </motion.button>
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center space-y-2 py-6">
                  <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center border border-dashed border-white/10">
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

                    return (
                      <div
                        key={virtualItem.key}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                          paddingBottom: '4px',
                        }}
                      >
                        <motion.div
                          variants={listItemVariants}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            onSelect((model as any).realId || model.id);
                          }}
                          className={`
                            flex items-center justify-between gap-1.5 p-1.5 rounded-md transition-all duration-300 border text-left group relative overflow-hidden cursor-pointer h-full
                            ${
                              isSelected
                                ? isNoKey
                                  ? 'bg-muted border-border'
                                  : 'bg-primary/5 border-primary/10'
                                : 'bg-transparent border-transparent hover:bg-muted/40 hover:border-border'
                            }
                          `}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <h4
                                className={`text-[9px] font-bold truncate leading-none ${isSelected ? 'text-foreground font-black' : 'text-foreground/80'}`}
                              >
                                {model.name}
                              </h4>

                              {/* Status Tag */}
                              {providerStatuses && providerStatuses[model.provider] && (
                                <div
                                  className={`
                                  text-[5.5px] font-black uppercase tracking-wider px-1 py-0.5 rounded-[3px] border shrink-0
                                  ${
                                    isOnline
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : isNoKey
                                        ? 'bg-zinc-800 border-white/[0.04] text-zinc-400'
                                        : 'bg-zinc-900 border-white/[0.04] text-zinc-500'
                                  }
                                `}
                                >
                                  {isOnline ? 'Online' : isNoKey ? 'Auth' : 'Off'}
                                </div>
                              )}

                              {/* Inline Monospace Specs Badge */}
                              {model.specs?.contextWindow && (
                                <span className="text-[6px] font-mono font-bold text-muted-foreground/50 bg-white/5 px-1 py-0.5 rounded border border-white/5 shrink-0 ml-auto leading-none">
                                  {model.specs.contextWindow}
                                </span>
                              )}
                            </div>

                            <p className="text-[7px] font-mono text-zinc-500 truncate uppercase tracking-tight mt-0.5 leading-none">
                              {model.description || model.id}
                            </p>
                          </div>

                          {isSelected && (
                            <div
                              className={`w-3.5 h-3.5 rounded-md flex items-center justify-center shrink-0 ${isNoKey ? 'bg-zinc-600' : 'bg-white border border-white/10'}`}
                            >
                              <Check
                                className={`w-2 h-2 ${isNoKey ? 'text-white' : 'text-black'}`}
                              />
                            </div>
                          )}
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
          <span className="px-1 text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground shrink-0 w-[80px]">
            Execution
          </span>
          <div className="flex-1 flex gap-1 bg-background p-0.5 rounded-md border border-border">
            {(['standard', 'parallel', 'ensemble', 'ab-test'] as ExecutionMode[]).map((mode) => (
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
