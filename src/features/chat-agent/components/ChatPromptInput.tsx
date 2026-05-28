/**
 * @file src/features/chat-agent/components/ChatPromptInput.tsx
 * @description Prompt pill with inference settings panel, tailored specifically for the Chat Agent.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, StopCircle,
  X, Zap, Info, ChevronDown, Bot, Globe,
  Mic, SlidersHorizontal, MemoryStick, Cpu, Thermometer,
  Layers, RotateCcw, Check
} from 'lucide-react';
import { ModelSelector } from '@src/features/model-registry/components/ModelSelector';
import { ModelDefinition } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { analyzePrompt, optimizePromptText } from '@/shared/promptAnalyzer';

interface ChatPromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (finalPrompt: string) => void;
  isLoading: boolean;
  onStop: () => void;
  currentModelId: string | null;
  currentModel: ModelDefinition | null;
  allModels: any[];
  providerStatuses: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls: Record<string, string>;
  onModelSelect: (id: string) => void;
  onClearHistory: () => void;
  onModelSettingsChange: (settings: any) => void;
  modelSettings: any;
  suggestedPrompts: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
  getCustomModelIcon: (model: ModelDefinition | null | undefined) => React.ReactNode;
  webSearchEnabled: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
  alignDropdown?: 'top' | 'bottom';
}

interface LocalInferenceSettings {
  gpuLayers: number;
  contextSize: number;
  threads: number;
  batchSize: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  mirostat: 0 | 1 | 2;
}

const tagContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    }
  }
};

const tagItemVariants = {
  hidden: { opacity: 0, x: -10, scale: 0.95 },
  visible: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 }
  }
};

export const ChatPromptInput: React.FC<ChatPromptInputProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading,
  onStop,
  currentModelId,
  currentModel,
  allModels,
  providerStatuses,
  gatewayUrls,
  onModelSelect,
  onClearHistory,
  onModelSettingsChange,
  modelSettings,
  getCustomModelIcon,
  webSearchEnabled,
  onWebSearchToggle,
  alignDropdown = 'top',
}) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [showSettings, setShowSettings] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isSubmitting = useRef(false);
  const localSettings = modelSettings;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const providerStr = String(currentModel?.provider ?? '');
  const isLocalModel = !!(
    currentModelId &&
    (providerStr === 'local' ||
      providerStr === 'nyx-native' ||
      (!currentModel && currentModelId))
  );

  useEffect(() => {
    if (isLocalModel) {
      setShowSettings(false);
    }
  }, [currentModelId]);

  useEffect(() => {
    if (!isLocalModel && showSettings) {
      setShowSettings(false);
    }
  }, [isLocalModel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowModelSelector(v => !v);
        setShowSettings(false);
      }

      if (e.key === 'Escape' && isLoading) {
        e.preventDefault();
        onStop();
        toast.info('Generation stopped');
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        onClearHistory();
        toast.success('Context reset');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onStop, onClearHistory]);

  const updateLocal = useCallback(<K extends keyof LocalInferenceSettings>(
    key: K, value: LocalInferenceSettings[K]
  ) => {
    onModelSettingsChange({ ...modelSettings, [key]: value });
  }, [modelSettings, onModelSettingsChange]);

  const resetLocalSettings = useCallback(() => {
    onModelSettingsChange({
      ...modelSettings,
      gpuLayers: 99,
      threads: 4,
      contextSize: 4096,
      batchSize: 512,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
    });
    toast.success('Settings reset to defaults');
  }, [modelSettings, onModelSettingsChange]);

  const adjustHeight = (reset?: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (reset) { ta.style.height = '36px'; return; }
    ta.style.height = '36px';
    ta.style.height = `${Math.max(36, Math.min(ta.scrollHeight, 220))}px`;
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading || isSubmitting.current) return;
    if (!currentModelId) { toast.error('Please select a model first'); return; }
    
    isSubmitting.current = true;
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      onSubmit(prompt);
      adjustHeight(true);
    } finally {
      setTimeout(() => {
        isSubmitting.current = false;
      }, 500);
    }
  };

  const canSubmit = !!prompt.trim() && !!currentModelId && !isLoading;

  const gpuModeLabel =
    localSettings.gpuLayers === 0 ? 'CPU Only' :
    localSettings.gpuLayers < 20 ? 'Minimal' :
    localSettings.gpuLayers < 50 ? 'Partial' :
    localSettings.gpuLayers < 90 ? 'Balanced' : 'Full VRAM';
  const gpuColor =
    localSettings.gpuLayers === 0 ? 'text-zinc-400' :
    localSettings.gpuLayers < 50 ? 'text-[#22D3EE]/70' : 'text-[#22D3EE]';

  return (
    <div className="shrink-0 w-full flex flex-col items-center px-4 pb-4 pt-2 bg-background z-30 gap-2">
      <div className={`relative w-full transition-all duration-500 ease-out ${prompt.trim().length > 0 ? 'max-w-3xl' : 'max-w-2xl'}`}>

        <AnimatePresence>
          {showModelSelector && (
            <ModelSelector
              currentModelId={currentModelId || undefined}
              allModels={allModels}
              selectedProvider={selectedProvider}
              searchTerm={modelSearch}
              onProviderChange={setSelectedProvider}
              onSearchChange={setModelSearch}
              onSelect={(id) => {
                onModelSelect(id);
                setShowModelSelector(false);
                setModelSearch('');
              }}
              onClose={() => setShowModelSelector(false)}
              providerStatuses={providerStatuses}
              isCoder={false}
              onResetContext={() => { onClearHistory(); toast.success('Context reset'); }}
              gatewayUrls={gatewayUrls}
              dropdown={true}
              alignDropdown={alignDropdown}
            />
          )}
        </AnimatePresence>

        {/* ── Settings Panel ────────────────────────────────────────── */}
        <AnimatePresence>
          {isLocalModel && showSettings && (
            <>
              <div
                className="fixed inset-0 z-[499]"
                onClick={() => setShowSettings(false)}
              />

              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute bottom-full mb-3 left-0 right-0 z-[500] bg-card border border-white/[0.04] p-1 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="w-full bg-card/98 border border-white/[0.04] rounded-[calc(1.5rem-4px)] overflow-hidden">
                  
                  <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-[#22D3EE]/10 border border-[#22D3EE]/20 flex items-center justify-center">
                        <SlidersHorizontal size={13} className="text-[#22D3EE]" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground/85">Local Inference</p>
                        <p className="text-[8px] text-[#22D3EE]/80 font-semibold uppercase tracking-wider mt-0.5">
                          {currentModel?.name || 'GGUF Model'} · settings
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
                            let recommendedModel = currentModelId || 'nyx-gemma-4-e2b-it';
                            let message = '';

                            if (sys.optimalLayers) {
                              newGpu = sys.optimalLayers.gpuLayers;
                              message = sys.optimalLayers.message;
                              if (vramGB >= 8 && currentModelId === 'nyx-gemma-4-e2b-it') {
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
                                recommendedModel = 'nyx-gemma-4-e2b-it';
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
                               threads: newThreads
                             });
                             if (recommendedModel && recommendedModel !== currentModelId) {
                               onModelSelect(recommendedModel);
                             }
                            
                            toast.success(message);
                          } catch (e) {
                            toast.error('Failed to analyze system');
                          }
                        }}
                        title="Auto-adjust based on system specs"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider text-muted-foreground/35 hover:text-emerald-400 hover:bg-emerald-500/8 border border-transparent hover:border-emerald-500/15 transition-all"
                      >
                        <Zap size={9} />
                        Analyze System
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        type="button"
                        onClick={resetLocalSettings}
                        title="Reset to defaults"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider text-muted-foreground/35 hover:text-[#22D3EE] hover:bg-[#22D3EE]/8 border border-transparent hover:border-[#22D3EE]/15 transition-all"
                      >
                        <RotateCcw size={9} />
                        Reset
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        type="button"
                        onClick={() => setShowSettings(false)}
                        className="p-1.5 rounded-xl text-muted-foreground/30 hover:text-foreground/70 hover:bg-white/5 transition-all"
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
                          <SectionLabel icon={<MemoryStick size={9} />} label="GPU / VRAM" color="text-[#22D3EE]" />
                          <div className="mt-3 p-3.5 rounded-2xl bg-[#22D3EE]/[0.04] border border-[#22D3EE]/10 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-wider">GPU Layers (ngl)</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[8px] font-black uppercase tracking-wider ${gpuColor}`}>{gpuModeLabel}</span>
                                <span className="text-[10px] font-mono font-bold text-foreground/45 tabular-nums">{localSettings.gpuLayers}</span>
                              </div>
                            </div>
                            <input
                              type="range" min={0} max={99} step={1}
                              value={localSettings.gpuLayers}
                              onChange={e => updateLocal('gpuLayers', Number(e.target.value))}
                              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#22D3EE] bg-white/8"
                            />
                            <div className="flex justify-between">
                              <span className="text-[7px] text-muted-foreground/25">CPU Only</span>
                              <span className="text-[7px] text-muted-foreground/25">Full VRAM</span>
                            </div>
                          </div>
                        </section>

                        <section>
                          <SectionLabel icon={<Layers size={9} />} label="Context & Memory" color="text-[#22D3EE]" />
                          <div className="mt-3">
                            <ParamSlider
                              label="Context Size"
                              hint="Tokens the model attends to. More = larger RAM footprint."
                              value={localSettings.contextSize}
                              min={512} max={32768} step={512}
                              display={v => `${Math.round(v / 1024)}K`}
                              accent="accent-[#22D3EE]"
                              onChange={v => updateLocal('contextSize', v)}
                            />
                          </div>
                        </section>
                      </div>

                      <div className="space-y-6">
                        <section>
                          <SectionLabel icon={<Thermometer size={9} />} label="Sampling" color="text-[#22D3EE]" />
                          <div className="mt-3 space-y-4">
                            <ParamSlider
                              label="Temperature"
                              hint="Randomness. 0 = deterministic, 1+ = creative."
                              value={localSettings.temperature ?? 0.7}
                              min={0} max={2} step={0.05}
                              display={v => (v ?? 0.7).toFixed(2)}
                              accent="accent-[#22D3EE]"
                              onChange={v => updateLocal('temperature', v)}
                              isFloat
                            />
                            <ParamSlider
                              label="Top-P (Nucleus)"
                              hint="Cumulative probability cutoff for token selection."
                              value={localSettings.topP ?? 0.95}
                              min={0} max={1} step={0.01}
                              display={v => (v ?? 0.95).toFixed(2)}
                              accent="accent-[#22D3EE]"
                              onChange={v => updateLocal('topP', v)}
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

        {/* ── Chat Prompt Capsule ─────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          layout
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="relative w-full"
        >
          <div className="w-full flex flex-col bg-zinc-900/60 backdrop-blur-xl border border-white/[0.04] focus-within:border-white/10 rounded-[24px] p-1.5 shadow-2xl">
            
            <motion.div 
              variants={tagContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center justify-between px-3 py-2 border-b border-white/[0.03] overflow-x-auto gap-3 scrollbar-none select-none"
            >
              <div className="flex items-center gap-2">
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    if (prompt.trim()) {
                      onPromptChange(optimizePromptText(prompt, analyzePrompt(prompt)));
                      toast.success('Prompt optimized!');
                    } else {
                      toast.error('Type a prompt first to optimize it');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/[0.03] border border-cyan-500/10 hover:border-cyan-500/25 transition-all text-left text-zinc-300 hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-cyan-500/15 flex items-center justify-center text-[9px] font-black text-cyan-400 leading-none font-mono">/</span>
                  <span className="text-[9.5px] font-bold tracking-tight">Optimize prompt</span>
                </motion.button>

                {/* Web Search Toggle Tag */}
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    onWebSearchToggle(!webSearchEnabled);
                    toast.success(`Web search ${!webSearchEnabled ? 'enabled' : 'disabled'}`);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all text-left cursor-pointer shrink-0 ${
                    webSearchEnabled
                      ? 'bg-sky-500/10 border border-sky-500/35 text-white'
                      : 'bg-sky-500/[0.03] border border-sky-500/10 text-zinc-300 hover:text-white hover:border-sky-500/25'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-black leading-none font-mono ${
                    webSearchEnabled ? 'bg-sky-500 text-black font-extrabold' : 'bg-sky-500/15 text-sky-400'
                  }`}>/</span>
                  <span className="text-[9.5px] font-bold tracking-tight">Web search</span>
                </motion.button>

                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    onPromptChange('');
                    toast.success('Context reset');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/[0.03] border border-amber-500/10 hover:border-amber-500/25 transition-all text-left text-zinc-300 hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-amber-500/15 flex items-center justify-center text-[9px] font-black text-amber-400 leading-none font-mono">/</span>
                  <span className="text-[9.5px] font-bold tracking-tight">Reset context</span>
                </motion.button>
              </div>

            </motion.div>

            <div className={`w-full bg-[#121214] border rounded-[16px] p-3 mt-1.5 flex flex-col gap-2 relative shadow-inner transition-all duration-300 border-white/[0.02] ${
              isFocused ? 'border-[#22D3EE]/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]' : ''
            }`}>
              {/* Microphone dictation button - absolute top right */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 group/mic z-10 select-none">
                <div className="flex items-center gap-[1.5px] h-2.5 opacity-0 group-hover/mic:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <span className="w-[1.5px] h-full bg-emerald-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
                  <span className="w-[1.5px] h-full bg-emerald-400 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
                  <span className="w-[1.5px] h-full bg-emerald-400 rounded-full animate-[bounce_0.6s_infinite_200ms]" />
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.08, color: '#FFFFFF' }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  className="text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer p-1"
                  title="Voice Input"
                >
                  <Mic size={14} />
                </motion.button>
              </div>

              {/* Submit / Stop button - absolute bottom right */}
              <div className="absolute bottom-3 right-3 z-10 select-none">
                {isLoading ? (
                  <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={onStop}
                    className="h-7 px-3 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center gap-1 border border-red-500/20 text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer"
                  >
                    <StopCircle className="w-3 h-3 animate-pulse" />
                    Stop
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: canSubmit ? 1.05 : 1, boxShadow: canSubmit ? '0 0 10px rgba(34, 211, 238, 0.25)' : 'none' }}
                    whileTap={{ scale: canSubmit ? 0.95 : 1 }}
                    type="submit"
                    disabled={!canSubmit}
                    className={`h-7 w-7 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
                      canSubmit
                        ? 'bg-[#22D3EE] text-black border-[#22D3EE] font-bold'
                        : 'bg-white/5 border-transparent text-zinc-700 cursor-not-allowed'
                    }`}
                  >
                    <Send size={11} strokeWidth={2.5} />
                  </motion.button>
                )}
              </div>

              <div className="flex items-center gap-2 px-1 pr-12">
                <motion.button
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModelSelector(v => !v);
                    setShowSettings(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/5 text-[10px] font-bold text-zinc-300 transition-all select-none cursor-pointer"
                >
                  {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-3 h-3 text-zinc-500" />}
                  <span className="truncate max-w-[150px]">{currentModel?.name || 'Select model'}</span>
                  <ChevronDown className="w-3 h-3 opacity-40 shrink-0" />
                </motion.button>
                
                {isLocalModel && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => {
                      setShowSettings(v => !v);
                      setShowModelSelector(false);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                      showSettings 
                        ? 'bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30'
                        : 'bg-white/[0.03] border border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <SlidersHorizontal size={9} />
                    <span>Configure</span>
                  </motion.button>
                )}
              </div>

              <div className="flex items-start gap-1.5 px-1 pr-10">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onChange={e => { onPromptChange(e.target.value); adjustHeight(); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1.5 px-1 resize-none min-h-[36px] max-h-[220px] font-medium outline-none text-foreground/90 placeholder:text-zinc-600 focus:outline-none"
                  style={{ scrollbarWidth: 'none' }}
                />
              </div>
            </div>
          </div>
        </motion.form>
      </div>
    </div>
  );
};

const SectionLabel: React.FC<{ icon: React.ReactNode; label: string; color: string }> = ({ icon, label, color }) => (
  <div className={`flex items-center gap-1.5 ${color}`}>
    {icon}
    <span className="text-[8px] font-black uppercase tracking-[0.25em] opacity-80">{label}</span>
  </div>
);

const ParamSlider: React.FC<{
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  accent: string;
  onChange: (v: number) => void;
  isFloat?: boolean;
}> = ({ label, hint, value, min, max, step, display, accent, onChange, isFloat }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between mb-0.5">
      <div className="flex-1 min-w-0">
        <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-wider">{label}</span>
        <p className="text-[7px] text-muted-foreground/30 mt-0.5 leading-snug">{hint}</p>
      </div>
      <span className="text-[10px] font-mono font-bold text-foreground/50 ml-3 shrink-0 tabular-nums">{display(value)}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
      className={`w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/8 ${accent}`}
    />
  </div>
);
