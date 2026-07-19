import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { ZapIcon as Zap, CheckIcon as Check, LayersIcon as Layers } from '@animateicons/react/lucide';
import { RotateCcw, MemoryStick, Thermometer, Cpu, Settings2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { SectionLabel, ParamSlider } from '@shared/components/PromptInputSubcomponents';
import { useModelStore } from '@core/stores/useModelStore';

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

  useEffect(() => {
    // Legacy migrations removed
  }, []);

  const [hardwareEst, setHardwareEst] = useState<any>(null);

  const actualGpuModeLabel = hardwareEst 
    ? (hardwareEst.strategy === 'FullDedicated' ? 'Full GPU Computation' :
       hardwareEst.strategy === 'SharedMemory' ? 'GPU + PCIe Shared RAM' :
       hardwareEst.strategy === 'IntegratedMemory' ? 'Integrated GPU' : 'CPU Only')
    : gpuModeLabel;

  const actualGpuColor = hardwareEst
    ? (hardwareEst.strategy === 'FullDedicated' ? 'text-emerald-500' :
       hardwareEst.strategy === 'SharedMemory' ? 'text-blue-500' :
       hardwareEst.strategy === 'IntegratedMemory' ? 'text-amber-500' : 'text-muted-foreground')
    : 'text-muted-foreground';

  const loadedLocalModel = useModelStore((s) => s.loadedLocalModel);
  const setLoadedLocalModel = useModelStore((s) => s.setLoadedLocalModel);
  const localLibraryModels = useModelStore((s) => s.localLibraryModels);
  const [isRestarting, setIsRestarting] = useState(false);

  const currentDef = localLibraryModels.find(m => m.id === currentModelId);
  let maxContext = 131072; // Absolute fallback max
  if (currentDef?.specs?.contextWindow) {
    const val = String(currentDef.specs.contextWindow).toUpperCase();
    if (val.includes('K')) {
      maxContext = parseInt(val.replace('K', '').trim()) * 1024;
    } else {
      maxContext = parseInt(val.trim()) || 131072;
    }
  }


  const handleApplyRestart = async () => {
    if (!currentModelId) return;
    setIsRestarting(true);
    toast.info('Applying settings & restarting server...');

    let deferredResolve!: () => void;
    let deferredReject!: (err: Error) => void;
    const readyPromise = new Promise<void>((res, rej) => {
      deferredResolve = res;
      deferredReject = rej;
    });

    let unlistenFns: Array<() => void> = [];
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      for (const fn of unlistenFns) fn();
      unlistenFns = [];
    };

    try {
      const [unlistenLoading, unlistenReady, unlistenError, unlistenVram] = await Promise.all([
        listen<{ elapsed_secs?: number; status?: string }>('llm-server-loading', (event) => {
          const { elapsed_secs, status } = event.payload;
          if (status) toast.info(status, { id: 'restart-status' });
          else if (elapsed_secs !== undefined) {
            const timeStr = elapsed_secs > 60 ? `${Math.floor(elapsed_secs / 60)}m ${Math.floor(elapsed_secs % 60)}s` : `${elapsed_secs}s`;
            toast.info(`Loading... ${timeStr}`, { id: 'restart-status' });
          }
        }),
        listen<{ status: string }>('llm-server-ready', () => {
          cleanup();
          deferredResolve();
        }),
        listen<{ error: string }>('llm-server-error', (event) => {
          cleanup();
          deferredReject(new Error(event.payload.error));
        }),
        listen<{ ngl: number, fully_gpu: boolean, suggest_cloud_fallback: boolean, message: string }>('vram-decision', (event) => {
          if (event.payload.suggest_cloud_fallback) {
            toast.warning(event.payload.message, { duration: 10000, id: 'vram-decision' });
          } else {
            toast.info(event.payload.message, { id: 'vram-decision' });
          }
        }),
      ]);

      unlistenFns = [unlistenLoading, unlistenReady, unlistenError, unlistenVram];
      timeoutId = setTimeout(() => {
        cleanup();
        deferredReject(new Error('Model load timed out after 300 seconds.'));
      }, 300_000);

      await invoke('stop_local_server');

      invoke('start_local_server', {
        modelId: currentModelId,
        contextSize: localSettings.contextSize ?? 0,
        gpuLayers: localSettings.gpuLayers,
        cpuThreads: localSettings.threads || 0,
        flashAttention: localSettings.flashAttention ?? true,
        kvCacheType: localSettings.kvCacheType || 'auto',
        useMlock: localSettings.useMlock ?? false,
        batchSize: localSettings.batchSize || 0,
        draftModelId: localSettings.draftModelId,
        disableKvOffload: localSettings.disableKvOffload ?? false,
      }).catch((err: unknown) => {
        cleanup();
        deferredReject(new Error(String(err)));
      });

      await readyPromise;

      setLoadedLocalModel(currentModelId);
      toast.success('Model restarted with new settings!', { id: 'restart-status' });
      setShowSettings(false);
    } catch (err: unknown) {
      cleanup();
      toast.error(String((err as Error)?.message || err || 'Failed to restart model'), { id: 'restart-status' });
    } finally {
      setIsRestarting(false);
    }
  };

  useEffect(() => {
    if (!showSettings || !isLocalModel || !currentModelId) return;
    const timer = setTimeout(() => {
      invoke('estimate_hardware_usage', {
        modelId: currentModelId,
        contextSize: localSettings.contextSize || 8192,
        gpuLayers: 99,
      }).then((res: any) => {
        setHardwareEst(res);
      }).catch(console.warn);
    }, 300); // debounce
    return () => clearTimeout(timer);
  }, [showSettings, isLocalModel, currentModelId, localSettings.contextSize]);

  return (
    <>
      {/* ── Settings Panel ────────────────────────────────────────── */}
      <AnimatePresence>
        {isLocalModel && showSettings && (
          <>
            <div className="fixed inset-0 z-[499]" onClick={() => setShowSettings(false)} />

            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="absolute bottom-full mb-3 left-0 right-0 z-[500] bg-card border border-border p-1 rounded-md shadow-sm overflow-hidden"
            >
              <div className="w-full bg-card/98 border border-border rounded-[calc(1.5rem-4px)] overflow-hidden">
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-md bg-muted/50 border border-border flex items-center justify-center">
                      <Zap size={13} className="text-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground">
                        Local Inference
                      </p>
                      <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                        {currentModelId || 'GGUF Model'} · settings
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={async () => {
                        try {
                          const { invoke } = await import('@tauri-apps/api/core');
                          const sys = await invoke<any>('get_system_diagnostics', { modelId: currentModelId });
                          const ramGB = sys.totalmem / (1024 * 1024 * 1024);
                          const vramGB = (sys.vram || 0) / (1024 * 1024 * 1024);

                          let newGpu = 10;
                          let recommendedModel = currentModelId || 'qwen2.5-coder-1.5b-native';
                          let message = '';

                          if (sys.optimalLayers) {
                            newGpu = sys.optimalLayers.gpuLayers;
                            message = sys.optimalLayers.message;
                            if (vramGB >= 8 && currentModelId === 'qwen2.5-coder-1.5b-native') {
                              recommendedModel = 'qwen2.5-coder-3b-native';
                              message += ` High VRAM detected, switching to qwen2.5-coder-3b-native for optimal code generation.`;
                            }
                          } else {
                            if (vramGB >= 8) {
                              newGpu = 99;
                              recommendedModel = 'qwen2.5-coder-3b-native';
                              message = `High VRAM detected (${Math.round(vramGB)}GB). Optimal settings applied.`;
                            } else if (vramGB > 0) {
                              newGpu = 99;
                              recommendedModel = 'qwen2.5-coder-1.5b-native';
                              message = `VRAM detected (${vramGB.toFixed(1)}GB). Optimal settings applied.`;
                            } else if (ramGB >= 24) {
                              newGpu = 99;
                              recommendedModel = 'qwen2.5-coder-3b-native';
                              message = `High RAM detected (${Math.round(ramGB)}GB). Optimal settings applied.`;
                            } else if (ramGB >= 15) {
                              newGpu = 50;
                              recommendedModel = 'qwen2.5-coder-3b-native';
                              message = `Moderate RAM detected (${Math.round(ramGB)}GB). Optimal settings applied.`;
                            } else if (ramGB >= 7) {
                              newGpu = 20;
                              message = `System analyzed: ${Math.round(ramGB)}GB RAM. Settings adjusted.`;
                            } else {
                              message = `Basic system: ${Math.round(ramGB)}GB RAM. Using safe defaults.`;
                            }
                          }

                          const newThreads = Math.max(1, Math.floor(sys.cpus * 0.75));

                          onModelSettingsChange({
                            ...modelSettings,
                            gpuLayers: newGpu,
                            threads: newThreads,
                          });
                          if (recommendedModel && recommendedModel !== currentModelId) {
                            onModelSelect(recommendedModel);
                          }

                          toast.success(message);
                        } catch (e: any) {
                          toast.error('Failed to analyze system');
                        }
                      }}
                      title="Auto-adjust based on system specs"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider text-muted-foreground/35 hover:text-emerald-400 hover:bg-emerald-500/8 border border-transparent hover:border-emerald-500/15 transition-all"
                    >
                      <Zap size={9} />
                      Analyze System
                    </motion.button>
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
                      {isRestarting ? 'Applying...' : (loadedLocalModel === currentModelId ? 'Apply & Restart' : 'Apply & Start')}
                    </motion.button>
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

                <div
                  className="overflow-y-auto max-h-[60dvh] sm:max-h-[420px] px-4 sm:px-6 py-4 sm:py-5"
                  style={{ scrollbarWidth: 'none' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                    <div className="space-y-6">
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
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[9px] font-black uppercase tracking-wider ${actualGpuColor}`}
                              >
                                {actualGpuModeLabel}
                              </span>
                            </div>
                          </div>
                          
                          {hardwareEst && (
                            <div className="mt-2.5 pt-2.5 border-t border-border/50">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[8px] font-semibold text-muted-foreground">
                                  VRAM Usage ({hardwareEst.model_size_gb.toFixed(1)}GB Model | CTX: {localSettings.contextSize === 0 ? 'Default' : `${Math.round((localSettings.contextSize || 8192) / 1024)}K`})
                                </span>
                                <span className="text-[9px] font-mono text-foreground">
                                  {Math.round(hardwareEst.estimated_vram_mb / 102.4) / 10} GB / {Math.round(hardwareEst.available_vram_mb / 102.4) / 10} GB avail.
                                </span>
                              </div>
                              <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden flex">
                                {(() => {
                                  const pct = Math.min(100, (hardwareEst.estimated_vram_mb / Math.max(1, hardwareEst.available_vram_mb)) * 100);
                                  const color = hardwareEst.strategy === 'FullDedicated' ? 'bg-emerald-500' :
                                                hardwareEst.strategy === 'SharedMemory' ? 'bg-blue-500' :
                                                hardwareEst.strategy === 'IntegratedMemory' ? 'bg-amber-500' : 'bg-muted-foreground';
                                  return <div className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} />;
                                })()}
                              </div>
                              {!hardwareEst.fully_gpu && (
                                <>
                                  <div className="flex justify-between items-center mb-1 mt-2">
                                    <span className="text-[8px] font-semibold text-muted-foreground">System RAM (Spillover)</span>
                                    <span className="text-[9px] font-mono text-foreground">
                                      {Math.round(hardwareEst.estimated_ram_mb / 102.4) / 10} GB
                                    </span>
                                  </div>
                                  <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden flex">
                                    <div className="bg-purple-500 h-full transition-all" style={{ width: `${Math.min(100, (hardwareEst.estimated_ram_mb / hardwareEst.ram_total_mb) * 100)}%` }} />
                                  </div>
                                </>
                              )}
                              <div className="mt-2 flex flex-col gap-1 text-[8px] font-medium text-muted-foreground">
                                <span>Detected GPU: {hardwareEst.gpu_name}</span>
                                <span className="text-[8px] text-muted-foreground/60 leading-tight">
                                  {hardwareEst.message}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>

                      <section>
                        <SectionLabel
                          icon={<Layers size={9} />}
                          label="Context & Memory"
                          color="text-foreground"
                        />
                        <div className="mt-3">
                          <ParamSlider
                            label="Context Size"
                            hint="Tokens the model attends to. 0 = model default."
                            value={localSettings.contextSize}
                            min={0}
                            max={maxContext}
                            step={512}
                            display={(v) => v === 0 ? "Default" : `${Math.round(v / 1024)}K`}
                            accent="accent-foreground"
                            onChange={(v) => updateLocal('contextSize', v)}
                          />

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

                    <div className="space-y-6">
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
                        </div>
                      </section>

                      <section>
                        <SectionLabel
                          icon={<Settings2 size={9} />}
                          label="Optimizations"
                          color="text-foreground"
                        />
                        <div className="mt-3 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Flash Attention</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">Saves VRAM on long contexts</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={localSettings.flashAttention ?? true}
                                onChange={(e) => updateLocal('flashAttention', e.target.checked)}
                              />
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                          </div>
                          
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
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                          </div>

                          <div className="pt-2 border-t border-border/50">
                            <label className="text-[10px] font-bold text-foreground block mb-1.5">KV Cache Quantization</label>
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

                          <div className="pt-2 border-t border-border/50">
                            <ParamSlider
                              label="Batch Size"
                              hint="Maximum logical batch size. 0 = Hardware Optimized."
                              value={localSettings.batchSize || 0}
                              min={0}
                              max={4096}
                              step={512}
                              display={(v) => v === 0 ? "Auto" : `${v}`}
                              accent="accent-foreground"
                              onChange={(v) => updateLocal('batchSize', v)}
                            />
                          </div>
                        </div>
                      </section>
                      <section>
                        <SectionLabel
                          icon={<Rocket size={9} />}
                          label="Advanced Orchestration"
                          color="text-foreground"
                        />
                        <div className="mt-3 space-y-4">

                          <div className="flex items-center justify-between pt-2">
                            <div>
                              <p className="text-[10px] font-bold text-foreground">Strict VRAM Enforcer</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">Disable KV Cache Offload to prevent PCIe bottlenecks</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={localSettings.disableKvOffload ?? false}
                                onChange={(e) => updateLocal('disableKvOffload', e.target.checked)}
                              />
                              <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                          </div>
                        </div>
                      </section>
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
