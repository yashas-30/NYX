// fallow-ignore-file code-duplication
import React, { useMemo, useEffect, useRef } from 'react';
import {
  SearchIcon as Search,
  CheckIcon as Check,
  InfoIcon as Info,
  XIcon as X,
  SparklesIcon as Sparkles,
  ZapIcon as Zap,
} from '@animateicons/react/lucide';
import { Bot, RefreshCw, HardDrive, Cpu, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { ModelOption } from '@src/types';
import { ProviderIcon, getProviderLabel } from '@src/shared/components/ui/ProviderIcon';

import { useNyxStore, DEFAULT_SETTINGS } from '@src/shared/store/useNyxStore';
import { ModelStatusBadge } from '@src/features/model-registry/ModelStatusBadge';
import { useModelStore } from '@src/core/stores/useModelStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import {
  formatContextWindow,
  useLocalServerStatus,
  isModelLoaded,
} from '@shared/hooks/useLocalModels';

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
  hideGateways?: boolean;
  hideNyxNative?: boolean;
}

// Structured provider order for the selector
const PROVIDER_ORDER = ['gemini', 'openrouter', 'nvidia-nim', 'groq', 'mistral', 'nyx-native'];

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  'nvidia-nim': 'https://integrate.api.nvidia.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
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
  hideGateways = false,
  hideNyxNative = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const localLibraryModels = useModelStore((s) => s.localLibraryModels);
  const loadedLocalModel = useModelStore((s) => s.loadedLocalModel);
  const setLoadedLocalModel = useModelStore((s) => s.setLoadedLocalModel);
  const loadLocalLibraryModels = useModelStore((s) => s.loadLocalLibraryModels);
  const [togglingModelId, setTogglingModelId] = React.useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState<string | null>(null);

  // Actively sync backend state so the UI always knows if a model is running
  useLocalServerStatus();

  const modelConfigs = useNyxStore((s) => s.modelConfigs);
  const updateModelConfig = useNyxStore((s) => s.updateModelConfig);
  const executionMode = useNyxStore((s) => s.executionMode);
  const setExecutionMode = useNyxStore((s) => s.setExecutionMode);

  const [expandedModelId, setExpandedModelId] = React.useState<string | null>(null);
  // Config is pulled dynamically inside handleLoadModel

  React.useEffect(() => {
    loadLocalLibraryModels();
  }, []);

  const handleLoadModel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const isDownloaded = localLibraryModels.some(
        (m) =>
          isModelLoaded(m.id, id) ||
          m.id === id ||
          (m as any).name === id ||
          (m as any).filePath === id
      );
      const isLocalExt = ['.gguf', '.safetensors', '.bin', '.pt', '.pth', '.onnx', '.ckpt'].some(
        (ext) => id.endsWith(ext)
      );
      if (!isDownloaded && !isLocalExt) {
        toast.error(`Model '${id}' is not downloaded locally. Please download it first.`);
        return;
      }

      setTogglingModelId(id);
      setLoadingStatus('Starting...');

      const state = useNyxStore.getState();
      const targetConfig = state.modelConfigs?.[id] || DEFAULT_SETTINGS;
      const {
        contextSize,
        gpuLayers,
        threads: cpuThreads,
        flashAttention,
        kvCacheType,
        useMlock,
        batchSize,
        draftModelId,
        disableKvOffload,
      } = targetConfig;

      let resolvedKvCacheType = kvCacheType;
      if (kvCacheType === 'auto') {
        const model = allModels.find((m) => m.id === id);
        const quantization = (model?.specs as any)?.quantization?.toLowerCase() || '';
        if (
          quantization.includes('q4') ||
          quantization.includes('q5') ||
          quantization.includes('q6') ||
          quantization.includes('q2') ||
          quantization.includes('q3')
        ) {
          resolvedKvCacheType = 'q4_0';
        } else if (quantization.includes('f16') || quantization.includes('f32')) {
          resolvedKvCacheType = 'f16';
        } else {
          resolvedKvCacheType = 'q8_0';
        }
      }

      // Use a deferred pattern so we can:
      // 1. Capture resolve/reject before creating listeners
      // 2. Await all listeners (guarantees they're registered) before invoke()
      // This eliminates the race condition where llm-server-ready fires
      // before the handler is attached.
      let deferredResolve!: () => void;
      let deferredReject!: (err: Error) => void;

      const readyPromise = new Promise<void>((res, rej) => {
        deferredResolve = res;
        deferredReject = rej;
      });

      // Declare cleanup/timeout before Promise.all so listener callbacks can call them.
      // (const is block-scoped and the callbacks close over these refs)
      let unlistenFns: Array<() => void> = [];
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        for (const fn of unlistenFns) fn();
        unlistenFns = [];
      };

      // Now that resolve/reject exist, register all listeners and AWAIT them
      const [unlistenLoading, unlistenReady, unlistenError, unlistenVram, unlistenDownload] =
        await Promise.all([
          listen<{ elapsed_secs?: number; status?: string }>('llm-server-loading', (event) => {
            const { elapsed_secs, status } = event.payload;
            if (status) {
              setLoadingStatus(status);
            } else if (elapsed_secs !== undefined) {
              const timeStr =
                elapsed_secs > 60
                  ? `${Math.floor(elapsed_secs / 60)}m ${Math.floor(elapsed_secs % 60)}s`
                  : `${elapsed_secs}s`;
              setLoadingStatus(`Loading model... ${timeStr}`);
            }
          }),
          listen<{ progress: number; status: string }>('llm-download-progress', (event) => {
            const { progress, status } = event.payload;
            setLoadingStatus(`${status} (${Math.round(progress)}%)`);
          }),
          listen<{ status: string }>('llm-server-ready', () => {
            cleanup();
            deferredResolve();
          }),
          listen<{ error: string }>('llm-server-error', (event) => {
            cleanup();
            deferredReject(new Error(event.payload.error));
          }),
          listen<{
            ngl: number;
            fully_gpu: boolean;
            suggest_cloud_fallback: boolean;
            message: string;
          }>('vram-decision', (event) => {
            if (event.payload.suggest_cloud_fallback) {
              toast.warning(event.payload.message, { duration: 10000, id: 'vram-decision' });
            } else {
              toast.info(event.payload.message, { id: 'vram-decision' });
            }
          }),
        ]);

      unlistenFns = [unlistenLoading, unlistenReady, unlistenError, unlistenVram, unlistenDownload];

      timeoutId = setTimeout(() => {
        cleanup();
        deferredReject(new Error('Model load timed out after 300 seconds.'));
      }, 300_000);

      // Listeners are fully registered — safe to invoke now
      invoke('start_local_server', {
        modelId: id,
        contextSize: contextSize ?? 8192,
        gpuLayers,
        cpuThreads,
        flashAttention,
        kvCacheType: resolvedKvCacheType,
        useMlock,
        batchSize,
        draftModelId,
        disableKvOffload,
      }).catch((err) => {
        cleanup();
        deferredReject(new Error(String(err)));
      });

      await readyPromise;

      setLoadedLocalModel(id);
      setTogglingModelId(null);
      setLoadingStatus(null);
      toast.success('Model loaded!');
      onSelect(id);
    } catch (err: any) {
      console.error(err);
      toast.error(String(err?.message || err || 'Failed to load model'));
      setTogglingModelId(null);
      setLoadingStatus(null);
    }
  };

  const handleUnloadModel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setTogglingModelId(loadedLocalModel);
      await invoke('stop_local_server');
      setLoadedLocalModel(null);
      setTogglingModelId(null);
      toast.success('Model unloaded successfully');
    } catch (err: any) {
      console.error(err);
      toast.error(err || 'Failed to unload model');
      setTogglingModelId(null);
    }
  };

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

    // For nyx-native, ONLY use localLibraryModels (authoritative from the Rust backend).
    // Exclude any nyx-native entries from allModels so phantom/stale presets never appear.
    const cloudOnlyModels = allModels.filter((m) => m.provider !== 'nyx-native');
    const nativeSource = localLibraryModels;

    const allSources = [...nativeSource, ...cloudOnlyModels];
    return allSources
      .filter((m) => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      })
      .map((m) => {
        const idLower = m.id.toLowerCase();
        const isVision =
          idLower.includes('vl') ||
          idLower.includes('vision') ||
          idLower.includes('multimodal') ||
          idLower.includes('pixtral') ||
          idLower.includes('llava') ||
          idLower.includes('gemini');
        const isReasoning =
          idLower.includes('r1') ||
          idLower.includes('reasoning') ||
          idLower.includes('thinking') ||
          idLower.includes('o1') ||
          idLower.includes('o3');

        return {
          ...m,
          capabilities: (m as any).capabilities || {
            vision: isVision,
            reasoning: isReasoning,
          },
        };
      });
  }, [allModels, localLibraryModels]);

  const selectedModel = useMemo(() => {
    if (!currentModelId) return null;
    return (
      mergedModels.find((m) => m.id === currentModelId || (m as any).realId === currentModelId) ||
      null
    );
  }, [mergedModels, currentModelId]);

  const selectedModelName = useMemo(() => {
    if (selectedModel?.name) return selectedModel.name;
    if (currentModelId) {
      if (currentModelId.includes('/') || currentModelId.includes('\\')) {
        const parts = currentModelId.split(/[/\\]/);
        return parts[parts.length - 1].replace(/\.[^/.]+$/, '');
      }
      return currentModelId;
    }
    return 'None Selected';
  }, [selectedModel, currentModelId]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {
      gemini: [],
      openrouter: [],
      'nvidia-nim': [],
      groq: [],
      mistral: [],
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
    let providers = Object.keys(groupedModels);
    if (hideNyxNative) {
      providers = providers.filter((p) => p !== 'nyx-native');
    }
    return providers.sort((a, b) => {
      const aIdx = PROVIDER_ORDER.indexOf(a);
      const bIdx = PROVIDER_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [groupedModels, hideNyxNative]);

  const filteredModels = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const modelsForProvider = groupedModels[selectedProvider] || [];
    return modelsForProvider.filter(
      (m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
    );
  }, [groupedModels, selectedProvider, searchTerm]);

  // Virtualizer setup — scrollable list with max 5 rows visible
  const MAX_VISIBLE_ROWS = 5;
  const ROW_ESTIMATE_PX = 56;
  const listMaxHeight =
    Math.min(Math.max(filteredModels.length, 1), MAX_VISIBLE_ROWS) * ROW_ESTIMATE_PX;

  const rowVirtualizer = useVirtualizer({
    count: filteredModels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
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

        {/* Header Bar: Selected Model & Filter */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-wider text-muted-foreground shrink-0">
              Selected:
            </span>
            <span
              className="text-[11px] font-semibold text-foreground truncate"
              title={selectedModelName}
            >
              {selectedModelName}
            </span>
            {selectedModel?.provider && (
              <span className="text-[7.5px] font-mono text-muted-foreground/80 shrink-0 px-1 py-0.5 bg-muted/60 rounded border border-border/40">
                {getProviderLabel(selectedModel.provider)}
              </span>
            )}
          </div>

          {/* Search Input */}
          <div className="relative flex items-center w-36 sm:w-44 shrink-0">
            <Search className="absolute left-2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter models..."
              className="w-full h-6 pl-6 pr-5 bg-background border border-border rounded text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-1.5 text-muted-foreground hover:text-foreground"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Main Content Split Area */}
        <div className="flex flex-1 min-h-0 gap-1.5 p-1.5 overflow-hidden">
          {/* Left Box: Providers (Gateways) */}
          {!hideGateways && (
            <div className="w-[clamp(100px,25%,120px)] shrink-0 bg-muted/30 border border-border rounded-md flex flex-col p-1 space-y-0.5 overflow-y-auto custom-scrollbar">
              <span className="px-1 py-0.5 text-[6.5px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Gateways
              </span>
              {sortedProviders.map((provider) => {
                let status = providerStatuses?.[provider];
                if (!status || status === 'offline' || status === 'no-key') {
                  if (provider === 'nvidia-nim' && providerStatuses?.['nvidia']) {
                    status = providerStatuses['nvidia'];
                  } else if (provider === 'nvidia' && providerStatuses?.['nvidia-nim']) {
                    status = providerStatuses['nvidia-nim'];
                  }
                }

                // If still not online, check if a valid API key exists for this provider
                if (!status || status === 'offline' || status === 'no-key') {
                  if (typeof window !== 'undefined') {
                    try {
                      const raw = localStorage.getItem('nyx_api_keys');
                      const parsed = raw ? JSON.parse(raw) : {};
                      const keyVal =
                        provider === 'gemini'
                          ? parsed['gemini'] || parsed['google']
                          : provider === 'nvidia-nim'
                            ? parsed['nvidia-nim'] || parsed['nvidia']
                            : provider === 'nvidia'
                              ? parsed['nvidia'] || parsed['nvidia-nim']
                              : parsed[provider];
                      if (keyVal && typeof keyVal === 'string' && keyVal.trim().length > 0) {
                        status = 'online';
                      }
                    } catch {}
                  }
                }

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
                          className={`w-1.5 h-1.5 rounded-full ${
                            status === 'online'
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
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
          )}

          {/* Right Box: Models Grid */}
          <div className="flex-1 bg-muted/10 border border-border rounded-md overflow-hidden flex flex-col">
            {/* Context Sub-header */}
            <div className="p-1.5 px-2 border-b border-border flex items-center justify-between bg-muted/20">
              <span className="text-[10px] font-semibold text-muted-foreground capitalize shrink-0">
                {getProviderLabel(selectedProvider)}
              </span>
              <div className="px-1.5 py-0.5 rounded-md bg-muted border border-border text-[7px] font-mono font-black text-foreground">
                {filteredModels.length.toString().padStart(2, '0')}
              </div>
            </div>

            {/* Scrollable list of models */}
            <div
              ref={parentRef}
              className="flex-1 overflow-y-auto p-2 custom-scrollbar"
              style={{
                maxHeight: `${MAX_VISIBLE_ROWS * ROW_ESTIMATE_PX}px`,
                minHeight:
                  filteredModels.length > 0
                    ? `${Math.min(filteredModels.length, MAX_VISIBLE_ROWS) * ROW_ESTIMATE_PX}px`
                    : '120px',
              }}
            >
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
                    const isSelected =
                      currentModelId === model.id || currentModelId === (model as any).realId;
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
                          onClick={() => {
                            onSelect((model as any).realId || model.id);
                          }}
                          className={`
                            flex flex-col gap-1.5 p-1.5 rounded-md transition-all duration-300 border text-left group relative overflow-hidden h-full cursor-pointer
                            ${
                              isSelected
                                ? isNoKey
                                  ? 'bg-muted border-border'
                                  : 'bg-primary/5 border-primary/10'
                                : 'bg-transparent border-transparent hover:bg-muted/40 hover:border-border'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <h4
                                  className={`text-[10px] font-semibold truncate leading-tight ${
                                    isSelected ? 'text-foreground font-black' : 'text-foreground/90'
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
                              </div>

                              <p className="text-[7.5px] font-mono text-muted-foreground/60 truncate uppercase tracking-tight mt-0.5 leading-none">
                                {model.description || model.id}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                              {/* Info Button: Placed directly next to the Select button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedModelId(isExpanded ? null : model.id);
                                }}
                                className={`p-1 rounded-md border transition-all shrink-0 ${
                                  isExpanded
                                    ? 'bg-primary/20 border-primary/40 text-primary'
                                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border'
                                }`}
                                title="Model Capabilities, Specs & Maximum Potential"
                              >
                                <Info size={11} />
                              </button>

                              {/* Native Model Load/Switch/Unload Button */}
                              {model.provider === 'nyx-native' &&
                                (() => {
                                  const isThisModelLoaded = isModelLoaded(
                                    model.id,
                                    loadedLocalModel
                                  );
                                  const isAnyModelLoaded = !!loadedLocalModel;
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        isThisModelLoaded
                                          ? handleUnloadModel(e)
                                          : handleLoadModel(model.id, e)
                                      }
                                      disabled={togglingModelId !== null}
                                      className={`
                                         px-2 py-0.5 rounded border text-[7px] font-bold tracking-wider uppercase transition-colors shrink-0
                                         ${
                                           isThisModelLoaded
                                             ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30 font-black'
                                             : isAnyModelLoaded
                                               ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                                               : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'
                                         }
                                         ${togglingModelId !== null ? 'opacity-50 cursor-not-allowed' : ''}
                                       `}
                                    >
                                      {togglingModelId === model.id
                                        ? loadingStatus || 'STARTING...'
                                        : isThisModelLoaded
                                          ? 'UNLOAD'
                                          : isAnyModelLoaded
                                            ? 'SWITCH'
                                            : 'LOAD'}
                                    </button>
                                  );
                                })()}

                              {/* Cloud Model Select Button */}
                              {model.provider !== 'nyx-native' && (
                                <button
                                  type="button"
                                  disabled={isNoKey}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isNoKey) onSelect((model as any).realId || model.id);
                                  }}
                                  className={`
                                    px-2 py-0.5 rounded border text-[7.5px] font-mono font-bold tracking-wider uppercase transition-all flex items-center gap-1 shrink-0
                                    ${
                                      isSelected
                                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                        : isNoKey
                                          ? 'bg-muted/40 border-border text-muted-foreground/50 cursor-not-allowed'
                                          : 'bg-muted/20 hover:bg-primary/20 border-border text-foreground hover:text-primary hover:border-primary/40'
                                    }
                                  `}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check size={9} className="stroke-[3]" />
                                      Active
                                    </>
                                  ) : isNoKey ? (
                                    'No Key'
                                  ) : (
                                    'Select'
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded Details: Real Capabilities, Specs & Maximum Potential */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-2 mt-1 border-t border-border/40 flex flex-col gap-2">
                                  {/* Real Capabilities Grid */}
                                  <div>
                                    <span className="text-[7px] font-mono font-black uppercase tracking-widest text-muted-foreground">
                                      Real Capabilities & Maximum Potential
                                    </span>
                                    <div className="grid grid-cols-3 gap-1 mt-1">
                                      <div
                                        className={`p-1 rounded border text-[7px] font-mono flex flex-col gap-0.5 ${
                                          (model as any).capabilities?.vision
                                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                            : 'bg-muted/30 border-border text-muted-foreground'
                                        }`}
                                      >
                                        <span className="font-bold">👁️ Vision</span>
                                        <span className="text-[6.5px] opacity-80 leading-tight">
                                          {(model as any).capabilities?.vision
                                            ? 'Multimodal Image/Doc Analysis'
                                            : 'Text-Only'}
                                        </span>
                                      </div>

                                      <div
                                        className={`p-1 rounded border text-[7px] font-mono flex flex-col gap-0.5 ${
                                          (model as any).capabilities?.reasoning ||
                                          (model as any).supportsThinking
                                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                            : 'bg-muted/30 border-border text-muted-foreground'
                                        }`}
                                      >
                                        <span className="font-bold">🧠 Reasoning</span>
                                        <span className="text-[6.5px] opacity-80 leading-tight">
                                          {(model as any).capabilities?.reasoning ||
                                          (model as any).supportsThinking
                                            ? 'Deep Thinking & Logic'
                                            : 'Direct Inference'}
                                        </span>
                                      </div>

                                      <div
                                        className={`p-1 rounded border text-[7px] font-mono flex flex-col gap-0.5 ${
                                          (model as any).capabilities?.toolCalling
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                            : 'bg-muted/30 border-border text-muted-foreground'
                                        }`}
                                      >
                                        <span className="font-bold">🛠️ Tool Calling</span>
                                        <span className="text-[6.5px] opacity-80 leading-tight">
                                          {(model as any).capabilities?.toolCalling
                                            ? 'Native Function & Tools'
                                            : 'Standard Text'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Specifications Matrix */}
                                  <div className="grid grid-cols-3 gap-1 bg-muted/20 p-1.5 rounded-md border border-border/40 text-[7px] font-mono">
                                    <div>
                                      <span className="text-muted-foreground block">Context:</span>
                                      <span className="font-bold text-foreground">
                                        {model.specs?.contextWindow || '128K'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block">
                                        Max Output:
                                      </span>
                                      <span className="font-bold text-foreground">
                                        {model.specs?.maxOutput || '8K'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block">Modality:</span>
                                      <span className="font-bold text-foreground">
                                        {model.specs?.modality || 'Text'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Model Description */}
                                  {model.description && (
                                    <p className="text-[7.5px] text-foreground/80 leading-snug">
                                      {model.description}
                                    </p>
                                  )}

                                  {/* Features List */}
                                  {model.features && model.features.length > 0 && (
                                    <div>
                                      <span className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/80">
                                        Features & Architectural Highlights
                                      </span>
                                      <ul className="list-disc list-outside ml-3 mt-0.5 space-y-0.5">
                                        {model.features.map((f: string, i: number) => (
                                          <li
                                            key={i}
                                            className="text-[8px] text-foreground/80 leading-snug"
                                          >
                                            {f}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Pros and Cons */}
                                  {model.pros && model.pros.length > 0 && (
                                    <div>
                                      <span className="text-[7px] font-black uppercase tracking-widest text-emerald-500/80">
                                        Strengths
                                      </span>
                                      <ul className="list-disc list-outside ml-3 mt-0.5 space-y-0.5">
                                        {model.pros.map((p: string, i: number) => (
                                          <li
                                            key={i}
                                            className="text-[8px] text-emerald-500/90 leading-snug"
                                          >
                                            {p}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {model.cons && model.cons.length > 0 && (
                                    <div>
                                      <span className="text-[7px] font-black uppercase tracking-widest text-destructive/80">
                                        Considerations
                                      </span>
                                      <ul className="list-disc list-outside ml-3 mt-0.5 space-y-0.5">
                                        {model.cons.map((c: string, i: number) => (
                                          <li
                                            key={i}
                                            className="text-[8px] text-destructive/90 leading-snug"
                                          >
                                            {c}
                                          </li>
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
