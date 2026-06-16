// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZapIcon as Zap, CheckIcon as Check, LayersIcon as Layers } from '@animateicons/react/lucide';
import { RotateCcw, MemoryStick, Thermometer, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { SectionLabel, ParamSlider } from '@shared/components/PromptInputSubcomponents';

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
  const gpuColor =
    localSettings.gpuLayers === 0
      ? 'text-zinc-500'
      : localSettings.gpuLayers < 90
        ? 'text-amber-400'
        : 'text-emerald-400';

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
              className="absolute bottom-full mb-3 left-0 right-0 z-[500] bg-card border border-white/[0.04] p-1 rounded-md shadow-sm border border-border overflow-hidden"
            >
              <div className="w-full bg-card/98 border border-white/[0.04] rounded-[calc(1.5rem-4px)] overflow-hidden">
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.05]">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-md bg-muted/50 border border-border flex items-center justify-center">
                      <Zap size={13} className="text-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground">
                        Local Inference
                      </p>
                      <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                        {currentModelId?.name || 'GGUF Model'} · settings
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={async () => {
                        try {
                          const modelIdParam = currentModelId ? `?modelId=${currentModelId}` : '';
                          const res = await fetch(`/api/system${modelIdParam}`);
                          const sys = await res.json();
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
                              newGpu = Math.floor(vramGB * 10);
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
                              GPU Layers (ngl)
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[8px] font-black uppercase tracking-wider ${gpuColor}`}
                              >
                                {gpuModeLabel}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-foreground tabular-nums">
                                {localSettings.gpuLayers}
                              </span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={99}
                            step={1}
                            value={localSettings.gpuLayers}
                            onChange={(e) => updateLocal('gpuLayers', Number(e.target.value))}
                            className="w-full h-1.5 rounded-md appearance-none cursor-pointer accent-foreground bg-muted"
                          />
                          <div className="flex justify-between">
                            <span className="text-[7px] text-muted-foreground">CPU Only</span>
                            <span className="text-[7px] text-muted-foreground">Full VRAM</span>
                          </div>
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
                            hint="Tokens the model attends to. More = larger RAM footprint."
                            value={localSettings.contextSize}
                            min={512}
                            max={32768}
                            step={512}
                            display={(v) => `${Math.round(v / 1024)}K`}
                            accent="accent-foreground"
                            onChange={(v) => updateLocal('contextSize', v)}
                          />
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
