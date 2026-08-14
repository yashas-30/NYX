import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { ZapIcon as Zap, CheckIcon as Check, LayersIcon as Layers } from '@animateicons/react/lucide';
import { RotateCcw, MemoryStick, Thermometer, Cpu, Settings2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { SectionLabel, ParamSlider } from '@shared/components/PromptInputSubcomponents';
import { z } from 'zod';
import { useModelStore } from '@core/stores/useModelStore';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useLocalServerStatus, isModelLoaded } from '@shared/hooks/useLocalModels';

interface LocalModelSettingsPanelProps {
  isLocalModel: boolean;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  currentModelId: string | null;
  onModelSelect: (id: string) => void;
  modelSettings: any;
  onModelSettingsChange: (settings: any) => void;
  resetLocalSettings: () => void;
  gpuModeLabel: string;
  updateLocal: (key: string, val: any) => void;
}

// ── Server status dot ─────────────────────────────────────────────────────────

function StatusDot({ running, loading }: { running: boolean; loading: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Loading
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider ${running ? 'text-emerald-400' : 'text-muted-foreground/50'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
      {running ? 'Running' : 'Stopped'}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const LocalModelSettingsPanel: React.FC<LocalModelSettingsPanelProps> = ({
  isLocalModel,
  showSettings,
  setShowSettings,
  currentModelId,
  onModelSelect,
  modelSettings,
  onModelSettingsChange,
  resetLocalSettings,
  gpuModeLabel,
  updateLocal,
}) => {
  const localSettings = modelSettings || {};

  const [hardwareEst, setHardwareEst] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  // Tracks the actual server context size and whether it was auto-reduced.
  // Populated by the `vram-decision` event emitted by start_local_server.
  const [liveServerCtx, setLiveServerCtx] = useState<{ size: number; capped: boolean } | null>(null);

  const loadedLocalModel = useModelStore((s) => s.loadedLocalModel);
  const setLoadedLocalModel = useModelStore((s) => s.setLoadedLocalModel);
  const localLibraryModels = useModelStore((s) => s.localLibraryModels);
  const advancedLocalModelSettings = useNyxStore((s) => s.advancedLocalModelSettings);

  // Real-time server status via 3 s polling
  const { data: serverStatus } = useLocalServerStatus();
  const serverRunning = serverStatus?.running ?? false;
  const serverLoading = isRestarting;

  // ── GPU strategy labels ───────────────────────────────────────────────────

  const actualGpuModeLabel = hardwareEst
    ? hardwareEst.fully_gpu
      ? 'Full GPU'
      : hardwareEst.hybrid
      ? 'Hybrid'
      : 'CPU Only'
    : (hardwareEst?.strategy === 'FullDedicated' ? 'Full GPU Computation' :
       hardwareEst?.strategy === 'SharedMemory' ? 'GPU + PCIe Shared RAM' :
       hardwareEst?.strategy === 'IntegratedMemory' ? 'Integrated GPU' : 'CPU Only');

  const actualGpuColor = hardwareEst
    ? hardwareEst.fully_gpu
      ? 'text-emerald-500'
      : hardwareEst.hybrid
      ? 'text-amber-400'
      : 'text-muted-foreground'
    : 'text-muted-foreground';

  // ── Context window max ────────────────────────────────────────────────────

  const currentDef = localLibraryModels.find((m) => m.id === currentModelId);

  const isImageModel = Boolean(
    currentDef?.capabilities?.imageGen ||
    currentDef?.model_type === 'text-to-image' ||
    (currentModelId || '').toLowerCase().includes('flux') ||
    (currentModelId || '').toLowerCase().includes('sdxl') ||
    (currentModelId || '').toLowerCase().includes('diffusion') ||
    (currentModelId || '').toLowerCase().includes('sd3') ||
    (currentModelId || '').toLowerCase().includes('safetensors') ||
    (currentModelId || '').toLowerCase().includes('ckpt')
  );

  // Max context length: prioritize detected GGUF header max_context_length, then parsed model spec, default to 131072 (128K)
  let maxContext = 131072;
  if (hardwareEst?.max_context_length && hardwareEst.max_context_length > 0) {
    maxContext = hardwareEst.max_context_length;
  } else if (currentDef?.specs?.contextWindow) {
    const val = String(currentDef.specs.contextWindow).toUpperCase();
    const cleanVal = val.replace(/\(.*?\)/g, '').trim(); // Remove things like "(extended to 256K)"
    
    if (cleanVal.includes('B')) {
      maxContext = parseInt(cleanVal.replace('B', '').trim()) * 1024 * 1024 * 1024;
    } else if (cleanVal.includes('M')) {
      maxContext = parseInt(cleanVal.replace('M', '').trim()) * 1024 * 1024;
    } else if (cleanVal.includes('K')) {
      maxContext = parseInt(cleanVal.replace('K', '').trim()) * 1024;
    } else {
      maxContext = parseInt(cleanVal.trim()) || 131072;
    }
  }

  // ── Hardware estimation: fires on open AND when key settings change ───────
  // Debounce ref so slider drags don't fire on every frame

  // Context Size Discrete Values — 0 = "Auto (8K)" lets the scheduler decide.
  const CONTEXT_SIZES = [
    { value: 0, label: 'Auto' },
    { value: 2048, label: '2K' },
    { value: 4096, label: '4K' },
    { value: 8192, label: '8K' },
    { value: 16384, label: '16K' },
    { value: 32768, label: '32K' },
    { value: 65536, label: '64K' },
    { value: 131072, label: '128K' },
    { value: 262144, label: '256K' },
    { value: 524288, label: '512K' },
  ];
  // Limit available context sizes to the model's maximum context length, but always include Auto (0)
  let availableContextSizes = CONTEXT_SIZES.filter(s => s.value <= maxContext || s.value === 0);
  if (maxContext > 0 && !availableContextSizes.find(s => s.value === maxContext)) {
    availableContextSizes.push({ value: maxContext, label: `${Math.round(maxContext / 1024)}K` });
  }

  // Default to 8K if undefined
  const storedCtx = localSettings.contextSize ?? 8192;
  const effectiveCtx = storedCtx;

  let foundIndex = availableContextSizes.findIndex(s => s.value === effectiveCtx);
  if (foundIndex === -1) {
    // Find the closest lower value
    foundIndex = availableContextSizes.reduce((best, s, i) =>
      s.value <= effectiveCtx ? i : best, 0);
  }
  const currentCtxIndex = foundIndex;

  const estDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHardwareEst = useCallback(() => {
    if (!currentModelId) return;
    if (estDebounceRef.current) clearTimeout(estDebounceRef.current);
    estDebounceRef.current = setTimeout(async () => {
      try {
        const res: any = await invoke('estimate_hardware_usage', {
          modelId: currentModelId,
          contextSize: localSettings.contextSize || 0,
          gpuLayers: localSettings.gpuLayers ?? null,
        });
        setHardwareEst(res);
      } catch (e) {
        console.warn('estimate_hardware_usage failed', e);
      }
    }, 16); // Reduced to 16ms (60 FPS) for lightning fast live data now that backend is fully cached
  }, [currentModelId, localSettings.contextSize, localSettings.gpuLayers]);

  // Trigger estimate whenever panel opens or relevant settings change
  useEffect(() => {
    if (!showSettings || !isLocalModel || !currentModelId) return;
    fetchHardwareEst();
    return () => {
      if (estDebounceRef.current) clearTimeout(estDebounceRef.current);
    };
  }, [showSettings, isLocalModel, currentModelId, fetchHardwareEst]);

  // ── Tauri event listeners for real-time server state while panel is open ──

  useEffect(() => {
    if (!showSettings) return;

    let unlistenLoading: (() => void) | undefined;
    let unlistenReady: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenVram: (() => void) | undefined;

    (async () => {
      try {
        unlistenLoading = await listen<{ elapsed_secs?: number; status?: string }>(
          'llm-server-loading',
          (event) => {
            setIsLoading(true);
            const { status, elapsed_secs } = event.payload;
            if (status) toast.info(status, { id: 'panel-server-status' });
            else if (elapsed_secs !== undefined) {
              const t = elapsed_secs > 60
                ? `${Math.floor(elapsed_secs / 60)}m ${Math.floor(elapsed_secs % 60)}s`
                : `${elapsed_secs}s`;
              toast.info(`Loading model... ${t}`, { id: 'panel-server-status' });
            }
          }
        );

        unlistenReady = await listen<{ status: string }>('llm-server-ready', () => {
          setIsLoading(false);
          toast.success('Model server ready', { id: 'panel-server-status' });
        });

        unlistenError = await listen<{ error: string }>('llm-server-error', (event) => {
          setIsLoading(false);
          toast.error(event.payload.error, { id: 'panel-server-status' });
        });

        // vram-decision: update the VRAM estimate in the panel in real-time
        unlistenVram = await listen<{
          ngl: number;
          fully_gpu: boolean;
          suggest_cloud_fallback: boolean;
          message: string;
          strategy?: string;
          effective_context_size?: number;
          context_capped?: boolean;
        }>('vram-decision', (event) => {
          const { suggest_cloud_fallback, message, effective_context_size, context_capped } = event.payload;
          // Update live server context badge
          if (effective_context_size) {
            setLiveServerCtx({ size: effective_context_size, capped: !!context_capped });
          }
          if (suggest_cloud_fallback) {
            toast.warning(message, { duration: 10000, id: 'vram-decision' });
          } else {
            toast.info(message, { id: 'vram-decision' });
          }
          // Re-fetch hardware estimate to update the VRAM bar
          fetchHardwareEst();
        });
      } catch (e) {
        console.warn('Failed to set up panel event listeners', e);
      }
    })();

    return () => {
      unlistenLoading?.();
      unlistenReady?.();
      unlistenError?.();
      unlistenVram?.();
    };
  }, [showSettings, fetchHardwareEst]);

  // ── Apply & Restart ───────────────────────────────────────────────────────

  const localSettingsSchema = z.object({
    contextSize: z.number().min(0).optional().nullable(),
    gpuLayers: z.number().min(-1).max(999).optional().nullable(),
    threads: z.number().min(0).max(128).optional().nullable(),
    flashAttention: z.boolean().optional().nullable(),
    kvCacheType: z.enum(['auto', 'f16', 'q8_0', 'q5_0', 'q5_1', 'q4_0', 'q4_1']).optional().nullable(),
    batchSize: z.number().min(0).max(8192).optional().nullable(),
    useMlock: z.boolean().optional().nullable(),
    disableKvOffload: z.boolean().optional().nullable(),
    draftModelId: z.string().optional().nullable(),
    temperature: z.number().min(0).max(2).optional().nullable(),
    topP: z.number().min(0).max(1).optional().nullable(),
    topK: z.number().min(0).max(100).optional().nullable(),
    repeatPenalty: z.number().min(0).max(2).optional().nullable(),
    presencePenalty: z.number().min(0).max(2).optional().nullable(),
    frequencyPenalty: z.number().min(0).max(2).optional().nullable(),
    maxTokens: z.number().min(0).optional().nullable(),
    splitMode: z.string().optional().nullable(),
    tensorSplit: z.string().optional().nullable(),
  });

  const handleApplyRestart = async () => {
    if (!currentModelId) return;

    // Validate settings before proceeding
    const result = localSettingsSchema.safeParse(localSettings);
    if (!result.success) {
      toast.error(`Invalid settings: ${result.error.issues[0].message}`);
      return;
    }

    // Persist and commit updated model settings to store & localStorage
    const store = useNyxStore.getState();
    store.updateModelConfig(currentModelId, localSettings);
    store.updateModelSettings(localSettings);
    onModelSettingsChange(localSettings);

    setIsRestarting(true);
    toast.info('Applying settings & restarting server...');

    const abortController = new AbortController();
    const signal = abortController.signal;
    let unlistenFns: Array<() => void> = [];

    const cleanup = () => {
      for (const fn of unlistenFns) fn();
      unlistenFns = [];
    };

    try {
      const waitForEvent = <T,>(eventName: string): Promise<T> => {
        return new Promise((resolve, reject) => {
          let unlisten: () => void;
          
          const onAbort = () => {
            unlisten?.();
            reject(new Error('Aborted'));
          };
          signal.addEventListener('abort', onAbort);

          listen<T>(eventName, (event) => {
            unlisten?.();
            signal.removeEventListener('abort', onAbort);
            resolve(event.payload);
          }).then((fn) => {
            unlisten = fn;
            unlistenFns.push(unlisten);
          });
        });
      };

      // Set up parallel listeners for status updates (non-blocking)
      const setupStatusListeners = async () => {
        const [unlistenLoading, unlistenVram, unlistenDownload] = await Promise.all([
          listen<{ elapsed_secs?: number; status?: string }>('llm-server-loading', (event) => {
            if (signal.aborted) return;
            const { elapsed_secs, status } = event.payload;
            if (status) toast.info(status, { id: 'restart-status' });
            else if (elapsed_secs !== undefined) {
              const timeStr = elapsed_secs > 60
                ? `${Math.floor(elapsed_secs / 60)}m ${Math.floor(elapsed_secs % 60)}s`
                : `${elapsed_secs}s`;
              toast.info(`Loading... ${timeStr}`, { id: 'restart-status' });
            }
          }),
          listen<{ progress: number; status: string }>('llm-download-progress', (event) => {
            if (signal.aborted) return;
            const { progress, status } = event.payload;
            toast.info(`${status} (${Math.round(progress)}%)`, { id: 'restart-status' });
          }),
          listen<{ ngl: number; fully_gpu: boolean; suggest_cloud_fallback: boolean; message: string }>('vram-decision', (event) => {
            if (signal.aborted) return;
            if (event.payload.suggest_cloud_fallback) {
              toast.warning(event.payload.message, { duration: 10000, id: 'vram-decision' });
            } else {
              toast.info(event.payload.message, { id: 'vram-decision' });
            }
          })
        ]);
        unlistenFns.push(unlistenLoading, unlistenVram, unlistenDownload);
      };
      await setupStatusListeners();

      // Create a timeout that aborts the controller
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 300_000);

      // Await stop first so there's no race condition
      await invoke('stop_local_server');
      
      // Register ready/error listeners BEFORE invoking start_local_server.
      // Image models fire llm-server-ready almost instantly (no llama-server process),
      // so if we register the listener after invoke() we miss the event entirely.
      const readyPromise = waitForEvent<{ status: string }>('llm-server-ready');
      const errorPromise = waitForEvent<{ error: string }>('llm-server-error').then(payload => {
        throw new Error(payload.error);
      });

      const startPromise = invoke('start_local_server', {
        modelId: currentModelId,
        contextSize: localSettings.contextSize ?? 0,
        gpuLayers: localSettings.gpuLayers === -1 ? null : localSettings.gpuLayers,
        cpuThreads: localSettings.threads || 0,
        flashAttention: localSettings.flashAttention ?? false,
        kvCacheType: localSettings.kvCacheType || 'auto',
        useMlock: localSettings.useMlock ?? false,
        batchSize: localSettings.batchSize || 0,
        draftModelId: localSettings.draftModelId,
        disableKvOffload: localSettings.disableKvOffload ?? false,
        splitMode: localSettings.splitMode,
        tensorSplit: localSettings.tensorSplit,
      });

      // Wait for either success, error event, or backend invocation failure
      await Promise.race([
        startPromise.then(() => readyPromise),
        errorPromise,
      ]);

      clearTimeout(timeoutId);

      setLoadedLocalModel(currentModelId);
      toast.success('Model restarted with new settings!', { id: 'restart-status' });
      setShowSettings(false);
    } catch (err: unknown) {
      if ((err as Error).message === 'Aborted') {
        toast.error('Model load timed out after 300 seconds.', { id: 'restart-status' });
      } else {
        toast.error(String((err as Error)?.message || err || 'Failed to restart model'), {
          id: 'restart-status',
        });
      }
    } finally {
      cleanup();
      setIsRestarting(false);
    }
  };

  // ── Auto-analyze ──────────────────────────────────────────────────────────

  const handleAnalyzeSystem = async () => {
    try {
      const sys = await invoke<any>('get_system_diagnostics', { modelId: currentModelId });
      const ramGB = sys.totalmem / (1024 * 1024 * 1024);
      const vramGB = (sys.vram || 0) / (1024 * 1024 * 1024);

      let newGpu: number | null = 10;
      let message = '';

      if (sys.optimalLayers) {
        newGpu = sys.optimalLayers.gpuLayers;
        message = sys.optimalLayers.message;
      } else {
        if (vramGB >= 8) {
          newGpu = null;
          message = `High VRAM (${Math.round(vramGB)}GB). Optimal settings applied.`;
        } else if (vramGB > 0) {
          newGpu = null;
          message = `VRAM detected (${vramGB.toFixed(1)}GB). Optimal settings applied.`;
        } else if (ramGB >= 24) {
          newGpu = null;
          message = `High RAM (${Math.round(ramGB)}GB). Optimal settings applied.`;
        } else if (ramGB >= 15) {
          newGpu = 50;
          message = `Moderate RAM (${Math.round(ramGB)}GB). Settings adjusted.`;
        } else if (ramGB >= 7) {
          newGpu = 20;
          message = `System analyzed: ${Math.round(ramGB)}GB RAM. Settings adjusted.`;
        } else {
          message = `Basic system: ${Math.round(ramGB)}GB RAM. Using safe defaults.`;
        }
      }

      const newThreads = Math.max(1, Math.floor((sys.cpus ?? 4) * 0.75));

      onModelSettingsChange({ ...modelSettings, gpuLayers: newGpu, threads: newThreads });
      toast.success(`${message} (Restart server to apply GPU/Thread changes)`);
    } catch {
      toast.error('Failed to analyze system');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {isLocalModel && showSettings && (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setShowSettings(false)} />

            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-full max-w-[800px] z-[9999] bg-card border border-border p-1 rounded-md shadow-sm overflow-hidden"
            >
              <div className="w-full bg-card/98 border border-border rounded-[calc(1.5rem-4px)] overflow-hidden">
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-md bg-muted/50 border border-border flex items-center justify-center">
                      <Zap size={13} className="text-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground">
                        Local Inference
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider">
                          {currentModelId || 'GGUF Model'} · settings
                        </p>
                        <StatusDot running={serverRunning} loading={serverLoading || isLoading} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Analyze System */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={handleAnalyzeSystem}
                      title="Auto-adjust based on system specs"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider text-muted-foreground/35 hover:text-emerald-400 hover:bg-emerald-500/8 border border-transparent hover:border-emerald-500/15 transition-all"
                    >
                      <Zap size={9} />
                      Analyze System
                    </motion.button>

                    {/* Reset */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={resetLocalSettings}
                      title="Reset to defaults"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent transition-all"
                    >
                      <RotateCcw size={9} />
                      Reset
                    </motion.button>

                    {/* Apply & Restart */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={handleApplyRestart}
                      disabled={isRestarting}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-all border ${
                        isRestarting
                          ? 'text-emerald-500/50 bg-emerald-500/5 border-emerald-500/10 cursor-not-allowed'
                          : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20'
                      }`}
                    >
                      {isRestarting
                        ? 'Applying...'
                        : isModelLoaded(currentModelId, loadedLocalModel)
                        ? 'Apply & Restart'
                        : 'Apply & Start'}
                    </motion.button>

                    {/* Close */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="p-1.5 rounded-md text-muted-foreground/30 hover:text-foreground/70 hover:bg-white/5 transition-all"
                    >
                      <Check size={13} />
                    </motion.button>
                  </div>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div
                  className="overflow-y-auto max-h-[60dvh] sm:max-h-[420px] px-4 sm:px-6 py-4 sm:py-5"
                  style={{ scrollbarWidth: 'none' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                    {/* Left column */}
                    <div className="space-y-6">
                      {/* GPU / VRAM */}
                      <section>
                        <SectionLabel
                          icon={<MemoryStick size={9} />}
                          label="GPU / VRAM"
                          color="text-foreground"
                        />
                        <div className="mt-3 p-3.5 rounded-md bg-muted/20 border border-border space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                              GPU Offload Strategy
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-wider ${actualGpuColor}`}>
                              {actualGpuModeLabel}
                            </span>
                          </div>

                          {hardwareEst && (
                            <div className="mt-2.5 pt-2.5 border-t border-border/50">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[8px] font-semibold text-muted-foreground">
                                  VRAM Usage ({hardwareEst.model_size_gb.toFixed(1)}GB Model | CTX:{' '}
                                  {effectiveCtx === 0
                                    ? 'Auto'
                                    : `${Math.round(effectiveCtx / 1024)}K`})
                                </span>
                                <span className="text-[9px] font-mono text-foreground">
                                  {Math.round(hardwareEst.estimated_vram_mb / 102.4) / 10} GB /{' '}
                                  {Math.round(hardwareEst.vram_available_mb / 102.4) / 10} GB avail.
                                </span>
                              </div>
                              <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden flex">
                                {(() => {
                                  const pct = Math.min(
                                    100,
                                    (hardwareEst.estimated_vram_mb /
                                      Math.max(1, hardwareEst.vram_available_mb)) *
                                      100
                                  );
                                  const color =
                                    hardwareEst.strategy === 'FullDedicated'
                                      ? 'bg-emerald-500'
                                      : hardwareEst.strategy === 'SharedMemory'
                                      ? 'bg-blue-500'
                                      : hardwareEst.strategy === 'IntegratedMemory'
                                      ? 'bg-amber-500'
                                      : 'bg-muted-foreground';
                                  return (
                                    <div
                                      className={`${color} h-full transition-all duration-300`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  );
                                })()}
                              </div>

                              {!hardwareEst.fully_gpu && (
                                <>
                                  <div className="flex justify-between items-center mb-1 mt-2">
                                    <span className="text-[8px] font-semibold text-muted-foreground">
                                      System RAM (Spillover)
                                    </span>
                                    <span className="text-[9px] font-mono text-foreground">
                                      {Math.round(hardwareEst.estimated_ram_mb / 102.4) / 10} GB
                                    </span>
                                  </div>
                                  <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden flex">
                                    <div
                                      className="bg-purple-500 h-full transition-all duration-300"
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          (hardwareEst.estimated_ram_mb / hardwareEst.ram_total_mb) * 100
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </>
                              )}

                              {/* iGPU Warning Banner */}
                              {hardwareEst.is_igpu && (
                                <div className="mt-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-start gap-1.5">
                                  <span className="text-amber-400 text-[9px] leading-none mt-0.5">⚠</span>
                                  <p className="text-[8px] leading-tight text-amber-300/90">
                                    Integrated GPU detected — context capped at 8192 tokens and GPU layers limited to 35% for system stability.
                                  </p>
                                </div>
                              )}

                              {/* Inference Mode Badge + GPU info */}
                              <div className="mt-2 flex items-center justify-between gap-1">
                                <div className="flex flex-col gap-0.5 text-[8px] font-medium text-muted-foreground">
                                  <span>Detected GPU: {hardwareEst.gpu_name}</span>
                                  <span className="text-[8px] text-muted-foreground/60 leading-tight">
                                    {hardwareEst.schedule_message || hardwareEst.message}
                                  </span>
                                </div>
                                {/* Mode pill */}
                                <span className={`shrink-0 text-[7px] font-bold px-1.5 py-0.5 rounded-full ${
                                  hardwareEst.fully_gpu
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : hardwareEst.hybrid
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                }`}>
                                  {hardwareEst.fully_gpu ? 'Full GPU' : hardwareEst.hybrid ? 'Hybrid' : 'CPU Only'}
                                </span>
                                {/* Active server context badge — shows effective context size after auto-reduction */}
                                {liveServerCtx && (
                                  <span
                                    title={liveServerCtx.capped ? 'Context was auto-reduced to fit VRAM' : 'Active server context window'}
                                    className={`shrink-0 text-[7px] font-bold px-1.5 py-0.5 rounded-full ${
                                      liveServerCtx.capped
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    }`}
                                  >
                                    {liveServerCtx.capped ? '⚡' : '📐'} CTX: {Math.round(liveServerCtx.size / 1024)}K{liveServerCtx.capped ? ' (auto)' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </section>

                      {/* Context & Memory */}
                      <section>
                        <SectionLabel
                          icon={<Layers size={9} />}
                          label="Context & Memory"
                          color="text-foreground"
                        />
                        <div className="mt-3">
                          <div className="p-3.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Dynamic Auto-Scaling Context</p>
                              </div>
                              <p className="text-[9px] text-muted-foreground mt-1">Context window automatically scales up to hardware limits as required by conversation length.</p>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full border border-emerald-500/30 shrink-0">
                              ⚡ Auto (Variable)
                            </span>
                          </div>

                          <div className="mt-4 pt-4 border-t border-border/50">
                            <ParamSlider
                              label="CPU Threads"
                              hint="Threads used for CPU processing. Match physical cores."
                              value={localSettings.threads || 4}
                              min={1}
                              max={32}
                              step={1}
                              display={(v) => `${v}`}
                              accent="accent-foreground"
                              onChange={(v) => updateLocal('threads', v)}
                            />
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* Right column */}
                    <div className="space-y-6">
                      {/* Sampling */}
                      <section>
                        <SectionLabel
                          icon={<Thermometer size={9} />}
                          label="Sampling"
                          color="text-foreground"
                        />
                        <div className="mt-3 space-y-4">
                          <ParamSlider
                            label="Temperature"
                            hint="Randomness. 0 = deterministic, 1+ = creative."
                            value={localSettings.temperature ?? 0.7}
                            min={0}
                            max={2}
                            step={0.05}
                            display={(v) => (v ?? 0.7).toFixed(2)}
                            accent="accent-foreground"
                            onChange={(v) => updateLocal('temperature', v)}
                            isFloat
                          />
                          {/* Advanced Settings Toggle */}
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Advanced Settings</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={advancedLocalModelSettings}
                                onChange={(e) => useNyxStore.getState().setAdvancedLocalModelSettings(e.target.checked)}
                              />
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500" />
                            </label>
                          </div>
                          
                          {advancedLocalModelSettings && (
                            <>
                              <ParamSlider
                                label="Top-P (Nucleus)"
                                hint="Cumulative probability cutoff for token selection."
                                value={localSettings.topP ?? 0.95}
                                min={0}
                                max={1}
                                step={0.01}
                                display={(v) => (v ?? 0.95).toFixed(2)}
                                accent="accent-foreground"
                                onChange={(v) => updateLocal('topP', v)}
                                isFloat
                              />
                              <ParamSlider
                                label="Top-K"
                                hint="Limit token selection to K most likely options."
                                value={localSettings.topK ?? 40}
                                min={0}
                                max={100}
                                step={1}
                                display={(v) => (v === 0 ? 'Auto' : `${v ?? 40}`)}
                                accent="accent-foreground"
                                onChange={(v) => updateLocal('topK', v)}
                              />
                              <ParamSlider
                                label="Repeat Penalty"
                                hint="Penalize repeating tokens. >1 reduces repetition."
                                value={localSettings.repeatPenalty ?? 1.1}
                                min={0}
                                max={2}
                                step={0.01}
                                display={(v) => (v ?? 1.1).toFixed(2)}
                                accent="accent-foreground"
                                onChange={(v) => updateLocal('repeatPenalty', v)}
                                isFloat
                              />
                              <ParamSlider
                                label="Presence Penalty"
                                hint="Penalize new tokens based on presence in text."
                                value={localSettings.presencePenalty ?? 0}
                                min={0}
                                max={2}
                                step={0.05}
                                display={(v) => (v ?? 0).toFixed(2)}
                                accent="accent-foreground"
                                onChange={(v) => updateLocal('presencePenalty', v)}
                                isFloat
                              />
                              <ParamSlider
                                label="Frequency Penalty"
                                hint="Penalize new tokens based on frequency in text."
                                value={localSettings.frequencyPenalty ?? 0}
                                min={0}
                                max={2}
                                step={0.05}
                                display={(v) => (v ?? 0).toFixed(2)}
                                accent="accent-foreground"
                                onChange={(v) => updateLocal('frequencyPenalty', v)}
                                isFloat
                              />
                            </>
                          )}
                          <div className="pt-2 border-t border-border/50">
                            <ParamSlider
                              label="Max Tokens"
                              hint="Maximum tokens to generate. 0 = Unlimited/Auto."
                              value={localSettings.maxTokens ?? 0}
                              min={0}
                              max={16384}
                              step={512}
                              display={(v) => (v === 0 ? 'Unlimited' : `${v}`)}
                              accent="accent-foreground"
                              onChange={(v) => updateLocal('maxTokens', v)}
                            />
                          </div>
                        </div>
                      </section>

                      {advancedLocalModelSettings && (
                        <>
                          {/* Optimizations */}
                          <section>
                        <SectionLabel
                          icon={<Settings2 size={9} />}
                          label="Optimizations"
                          color="text-foreground"
                        />
                        <div className="mt-3 space-y-4">
                          {/* Flash Attention */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Flash Attention</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">Saves VRAM on long contexts</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={localSettings.flashAttention ?? false}
                                onChange={(e) => updateLocal('flashAttention', e.target.checked)}
                              />
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500" />
                            </label>
                          </div>

                          {/* mlock */}
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Lock Memory (mlock)</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">Prevents swapping to disk</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={localSettings.useMlock ?? false}
                                onChange={(e) => updateLocal('useMlock', e.target.checked)}
                              />
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500" />
                            </label>
                          </div>

                          {/* KV Cache Quantization */}
                          <div className="pt-2 border-t border-border/50">
                            <label className="text-[10px] font-bold text-foreground block mb-1.5">
                              KV Cache Quantization
                            </label>
                            <select
                              value={localSettings.kvCacheType || 'auto'}
                              onChange={(e) => updateLocal('kvCacheType', e.target.value)}
                              className="w-full bg-muted/30 border border-border rounded-md text-[10px] px-2 py-1.5 text-foreground outline-none"
                            >
                              <option value="auto">Auto (Match Model)</option>
                              <option value="f16">FP16 (High Quality, High VRAM)</option>
                              <option value="q8_0">Q8_0 (Recommended, Balanced)</option>
                              <option value="q4_0">Q4_0 (Max VRAM Savings)</option>
                            </select>
                          </div>

                          {/* Batch Size */}
                          <div className="pt-2 border-t border-border/50">
                            <ParamSlider
                              label="Batch Size"
                              hint="Maximum logical batch size. 0 = Hardware Optimized."
                              value={localSettings.batchSize || 0}
                              min={0}
                              max={4096}
                              step={512}
                              display={(v) => (v === 0 ? 'Auto' : `${v}`)}
                              accent="accent-foreground"
                              onChange={(v) => updateLocal('batchSize', v)}
                            />
                          </div>
                        </div>
                      </section>

                      {/* Advanced Orchestration */}
                      <section>
                        <SectionLabel
                          icon={<Rocket size={9} />}
                          label="Advanced Orchestration"
                          color="text-foreground"
                        />
                        <div className="mt-3 space-y-4">
                          <div className="flex flex-col gap-2 pt-2">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Multi-GPU Split Mode</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                'row' (default) prevents GGML_ASSERT crashes on some backends.
                              </p>
                            </div>
                            <select
                              value={localSettings.splitMode || ''}
                              onChange={(e) => updateLocal('splitMode', e.target.value)}
                              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-emerald-500/50"
                            >
                              <option value="">Auto</option>
                              <option value="row">Row (Stable)</option>
                              <option value="layer">Layer</option>
                              <option value="none">None</option>
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Tensor Split (e.g. 3,2)</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                Proportion of VRAM per GPU (comma separated). Leave empty for auto.
                              </p>
                            </div>
                            <input
                              type="text"
                              placeholder="e.g. 3,2"
                              value={localSettings.tensorSplit || ''}
                              onChange={(e) => updateLocal('tensorSplit', e.target.value)}
                              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/50"
                            />
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Strict VRAM Enforcer</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                Disable KV Cache Offload to prevent PCIe bottlenecks
                              </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={localSettings.disableKvOffload ?? false}
                                onChange={(e) => updateLocal('disableKvOffload', e.target.checked)}
                              />
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500" />
                            </label>
                          </div>
                        </div>
                      </section>
                      </>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
