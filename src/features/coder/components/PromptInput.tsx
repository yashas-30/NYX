/**
 * @file src/features/coder/components/PromptInput.tsx
 * @description Prompt pill with LM Studio-style per-model inference settings panel.
 *   Settings panel appears above the whole pill (same level as model selector),
 *   resets per local model switch, only visible when a GGUF local model is active.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Settings as SettingsIcon, Check, StopCircle,
  Paperclip, X, Zap, Info, ChevronDown, Bot, Globe, Plus,
  Mic, SlidersHorizontal, MemoryStick, Cpu, Thermometer,
  Layers, RotateCcw, AlertTriangle
} from 'lucide-react';
import { ModelSelector } from '@src/components/model-card/ModelSelector';
import { ModelDefinition } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { analyzePrompt, optimizePromptText } from '@/shared/promptAnalyzer';

/* ── Types ───────────────────────────────────────────────────────────────── */
interface PromptInputProps {
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
  codebaseKnowledgeEnabled: boolean;
  onCodebaseKnowledgeToggle: (enabled: boolean) => void;
  mode?: 'chat' | 'code';
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

const DEFAULT_LOCAL: LocalInferenceSettings = {
  gpuLayers: 99,
  contextSize: 2048,
  threads: 4,
  batchSize: 512,
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  repeatPenalty: 1.1,
  mirostat: 0,
};

/* ── Component ───────────────────────────────────────────────────────────── */
export const PromptInput: React.FC<PromptInputProps> = ({
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
  mode,
  alignDropdown = 'top',
}) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const localSettings = modelSettings;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Detect local GGUF model ─────────────────────────────────────────── */
  const providerStr = String(currentModel?.provider ?? '');
  const isLocalModel = !!(
    currentModelId &&
    (providerStr === 'local' ||
      providerStr === 'nyx-native' ||
      (!currentModel && currentModelId))
  );

  /* ── Reset settings when switching local models ──────────────────────── */
  useEffect(() => {
    if (isLocalModel) {
      // Close settings panel when switching models so the user sees the reset
      setShowSettings(false);
    }
  }, [currentModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Close settings if user switches to a cloud model ───────────────── */
  useEffect(() => {
    if (!isLocalModel && showSettings) {
      setShowSettings(false);
    }
  }, [isLocalModel]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Global keyboard shortcuts ────────────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Toggle Model Selector (Cmd+K / Ctrl+K)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowModelSelector(v => !v);
        setShowSettings(false);
      }

      // 2. Stop active inference (Escape)
      if (e.key === 'Escape' && isLoading) {
        e.preventDefault();
        onStop();
        toast.info('Generation stopped');
      }

      // 3. Clear Chat History (Cmd+Shift+C / Ctrl+Shift+C)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        onClearHistory();
        toast.success('Context reset');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onStop, onClearHistory]);

  const analysis = prompt ? analyzePrompt(prompt) : null;
  const isHardware = analysis?.hardware?.isHardware || false;

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); toast.success(`Attached: ${file.name}`); }
  };

  const adjustHeight = (reset?: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (reset) { ta.style.height = '36px'; return; }
    ta.style.height = '36px';
    ta.style.height = `${Math.max(36, Math.min(ta.scrollHeight, 220))}px`;
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading) return;
    if (!currentModelId) { toast.error('Please select a model first'); return; }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    let finalPrompt = prompt;
    if (selectedFile) {
      try {
        const content = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = () => rej(r.error);
          r.readAsText(selectedFile);
        });
        finalPrompt = `[ATTACHED FILE: ${selectedFile.name}]\n\`\`\`\n${content}\n\`\`\`\n\n${prompt}`;
        setSelectedFile(null);
      } catch { toast.error('Could not read file'); return; }
    }
    onSubmit(finalPrompt);
    adjustHeight(true);
  };

  const canSubmit = !!prompt.trim() && !!currentModelId && !isLoading;

  /* ── GPU label helpers ───────────────────────────────────────────────── */
  const gpuModeLabel =
    localSettings.gpuLayers === 0 ? 'CPU Only' :
    localSettings.gpuLayers < 20 ? 'Minimal' :
    localSettings.gpuLayers < 50 ? 'Partial' :
    localSettings.gpuLayers < 90 ? 'Balanced' : 'Full VRAM';
  const gpuColor =
    localSettings.gpuLayers === 0 ? 'text-zinc-400' :
    localSettings.gpuLayers < 50 ? 'text-[#22D3EE]/70' : 'text-[#22D3EE]';

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="shrink-0 w-full flex flex-col items-center px-4 pb-4 pt-2 bg-background z-30">
      <div className={`relative w-full transition-all duration-500 ease-out ${prompt.trim().length > 0 ? 'max-w-3xl' : 'max-w-2xl'}`}>

        {/* ── Hardware critique panel ─────────────────────────────────── */}
        <AnimatePresence>
          {isHardware && analysis && analysis.hardware && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: 8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              className="mb-3 overflow-hidden rounded-2xl border border-primary/20 bg-zinc-900/90 backdrop-blur-xl shadow-2xl"
            >
              <div className="p-4">
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    <Bot className="w-3.5 h-3.5 text-primary" />
                    <span className="font-extrabold text-[10px] uppercase tracking-widest bg-gradient-to-r from-primary via-cyan-400 to-cyan-300 bg-clip-text text-transparent">
                      NYX Hardware Analyzer
                    </span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    type="button"
                    onClick={() => { onPromptChange(optimizePromptText(prompt, analysis)); toast.success('Prompt optimized!'); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/45 text-[9px] font-black uppercase tracking-widest text-primary transition-all"
                  >
                    <Zap className="w-3 h-3 text-[#22D3EE] fill-[#22D3EE] animate-pulse" />
                    Auto-Optimize Spec
                  </motion.button>
                </div>
                <div className="space-y-3 max-h-[180px] overflow-y-auto scrollbar-none pr-1">
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.hardware.detectedPlatforms.map((p: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-cyan-500/8 border border-cyan-500/15 text-[8px] font-bold uppercase tracking-wider text-cyan-400">Host: {p}</span>
                    ))}
                    {analysis.hardware.detectedComponents.map((c: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-primary/5 border border-primary/15 text-[8px] font-bold uppercase tracking-wider text-primary">Component: {c}</span>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {analysis.hardware.gaps.map((gap: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] text-yellow-200/90 bg-yellow-500/4 p-2 rounded-xl border border-yellow-500/10">
                        <span className="shrink-0">⚠</span><span className="leading-relaxed">{gap}</span>
                      </div>
                    ))}
                    {analysis.hardware.safetyHazards.map((h: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] text-red-200/90 bg-red-500/4 p-2 rounded-xl border border-red-500/10">
                        <span className="shrink-0">!</span><span className="leading-relaxed">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              isCoder={true}
              onResetContext={() => { onClearHistory(); toast.success('Context reset'); }}
              gatewayUrls={gatewayUrls}
              dropdown={true}
              alignDropdown={alignDropdown}
            />
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════════
            Settings Panel — above the pill, same level as model selector.
            Only rendered when a local GGUF model is active.
        ══════════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {isLocalModel && showSettings && (
            <>
              {/* Click-away backdrop */}
              <div
                className="fixed inset-0 z-[499]"
                onClick={() => setShowSettings(false)}
              />

              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                /* Double-Bezel Architecture */
                className="absolute bottom-full mb-3 left-0 right-0 z-[500] bg-card border border-white/[0.04] p-1 rounded-3xl shadow-2xl overflow-hidden"
              >
                {/* Inner Core */}
                <div className="w-full bg-card/98 border border-white/[0.04] rounded-[calc(1.5rem-4px)] overflow-hidden">
                  
                  {/* ── Header ─────────────────────────────────────────────── */}
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

                {/* ── Body — 2-column grid ────────────────────────────────── */}
                <div
                  className="overflow-y-auto max-h-[60dvh] sm:max-h-[420px] px-4 sm:px-6 py-4 sm:py-5"
                  style={{ scrollbarWidth: 'none' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">

                    {/* Left column */}
                    <div className="space-y-6">
                      {/* GPU / VRAM */}
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
                          <p className="text-[7px] text-muted-foreground/28 leading-relaxed">
                            {localSettings.gpuLayers === 0
                              ? 'All compute on CPU. No VRAM used.'
                              : localSettings.gpuLayers < 30
                              ? 'Low VRAM offload. Good for 2–4 GB.'
                              : localSettings.gpuLayers < 70
                              ? 'Balanced split. Recommended for 8 GB VRAM.'
                              : 'Max VRAM offload. Requires 12+ GB.'}
                          </p>
                        </div>
                      </section>

                      {/* Context */}
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

                      {/* CPU Compute */}
                      <section>
                        <SectionLabel icon={<Cpu size={9} />} label="CPU Compute" color="text-[#22D3EE]" />
                        <div className="mt-3 space-y-4">
                          <ParamSlider
                            label="CPU Threads"
                            hint="Parallel threads for CPU inference layers."
                            value={localSettings.threads}
                            min={1} max={32} step={1}
                            display={v => `${v}`}
                            accent="accent-[#22D3EE]"
                            onChange={v => updateLocal('threads', v)}
                          />
                          <ParamSlider
                            label="Batch Size"
                            hint="Tokens per step during prompt prefill."
                            value={localSettings.batchSize}
                            min={64} max={2048} step={64}
                            display={v => `${v}`}
                            accent="accent-[#22D3EE]"
                            onChange={v => updateLocal('batchSize', v)}
                          />
                        </div>
                      </section>
                    </div>

                    {/* Right column — Sampling */}
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
                          <ParamSlider
                            label="Top-K"
                            hint="Sample from top K tokens only. 0 = disabled."
                            value={localSettings.topK ?? 40}
                            min={0} max={200} step={1}
                            display={v => `${v ?? 40}`}
                            accent="accent-[#22D3EE]"
                            onChange={v => updateLocal('topK', v)}
                          />
                          <ParamSlider
                            label="Repeat Penalty"
                            hint="Penalises recently used tokens. > 1.0 reduces repetition."
                            value={localSettings.repeatPenalty ?? 1.1}
                            min={1} max={2} step={0.05}
                            display={v => (v ?? 1.1).toFixed(2)}
                            accent="accent-[#22D3EE]"
                            onChange={v => updateLocal('repeatPenalty', v)}
                            isFloat
                          />

                          {/* Mirostat */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="text-[8px] font-bold text-muted-foreground/55 uppercase tracking-wider">Mirostat</span>
                                <p className="text-[7px] text-muted-foreground/28 mt-0.5">Adaptive sampler — overrides Top-P / Top-K.</p>
                              </div>
                              <span className="text-[10px] font-mono font-bold text-foreground/40 tabular-nums">
                                {localSettings.mirostat === 0 ? 'Off' : `v${localSettings.mirostat}`}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              {([0, 1, 2] as const).map(v => (
                                <motion.button
                                  key={v}
                                  whileTap={{ scale: 0.9 }}
                                  type="button"
                                  onClick={() => updateLocal('mirostat', v)}
                                  className={`flex-1 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all ${
                                    localSettings.mirostat === v
                                      ? 'bg-[#22D3EE]/15 text-[#22D3EE] border border-[#22D3EE]/30'
                                      : 'bg-white/4 text-muted-foreground/35 border border-white/6 hover:bg-white/8 hover:text-muted-foreground/60'
                                  }`}
                                >
                                  {v === 0 ? 'Off' : `v${v}`}
                                </motion.button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>

                  {/* Footer note */}
                  <div className="mt-5 pt-4 border-t border-white/[0.04] flex items-start gap-2 px-6 pb-5">
                    <Info size={9} className="text-muted-foreground/20 mt-0.5 shrink-0" />
                    <p className="text-[7px] text-muted-foreground/20 leading-relaxed">
                      GPU Layers apply when the model is loaded into Resident RAM + VRAM. All other sampling parameters take effect on the next generation. Settings reset automatically when you switch models.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Main pill ─────────────────────────────────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          layout
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="relative w-full"
        >
          {/* Single clean pill in Claude warm charcoal background */}
          <div className="w-full p-[1px] bg-white/[0.03] border border-white/[0.04] rounded-2xl shadow-xl focus-within:border-white/10 transition-all duration-300">
            <div className="flex flex-col gap-2.5 p-2 bg-card rounded-[calc(1rem-1px)] transition-all">

              {/* Attachment chip */}
              <AnimatePresence>
                {selectedFile && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-800/40 border border-white/[0.04] rounded-xl self-start mx-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3 h-3 text-[#22D3EE] shrink-0" />
                      <span className="text-[10px] font-mono text-zinc-300 truncate max-w-[200px]">{selectedFile.name}</span>
                      <span className="text-[8px] text-zinc-500 shrink-0">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-0.5 rounded-full hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Textarea */}
              <div className="flex items-start gap-1.5 px-1.5">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={e => { onPromptChange(e.target.value); adjustHeight(); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Ask anything, @ to mention, / for actions"
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-1.5 resize-none min-h-[36px] max-h-[220px] font-medium outline-none text-foreground/90 placeholder:text-zinc-500"
                  style={{ scrollbarWidth: 'none' }}
                />
              </div>

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between px-1.5 pt-1">
                <div className="flex items-center gap-2">
                  {/* File upload + button */}
                  <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.03)' }}
                    whileTap={{ scale: 0.85 }}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-xl text-zinc-500 hover:text-white transition-all shrink-0 cursor-pointer"
                    title="Upload File"
                  >
                    <Plus size={15} />
                  </motion.button>

                  {/* Model selector button */}
                  <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.03)' }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setShowModelSelector(v => !v);
                      setShowSettings(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all select-none cursor-pointer border border-white/[0.04] bg-card text-zinc-300 hover:text-white`}
                  >
                    {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-3.5 h-3.5 text-zinc-400" />}
                    <span className="truncate max-w-[140px]">{currentModel?.name || 'Select model'}</span>
                    <ChevronDown className="w-3 h-3 opacity-40" />
                  </motion.button>

                  {webSearchEnabled && (
                    <div className="w-px h-4 bg-white/[0.04] mx-0.5" />
                  )}

                  {/* Web search */}
                  <ToolButton
                    active={webSearchEnabled}
                    onClick={() => onWebSearchToggle(!webSearchEnabled)}
                    title="Web Search"
                    icon={<Globe size={13} strokeWidth={1.5} className={webSearchEnabled ? 'animate-pulse text-[#22D3EE]' : ''} />}
                    activeColor="text-[#22D3EE] bg-white/[0.03] border-white/[0.04]"
                  />

                  {/* ⚙ Settings — only for local GGUF models */}
                  {isLocalModel && (
                    <div className="relative">
                      <ToolButton
                        active={showSettings}
                        onClick={() => {
                          setShowSettings(v => !v);
                          setShowModelSelector(false);
                        }}
                        title="Local Inference Settings"
                        icon={
                          <SettingsIcon
                            size={13}
                            strokeWidth={1.5}
                            className={`transition-transform duration-300 ${showSettings ? 'rotate-45 text-[#22D3EE]' : ''}`}
                          />
                        }
                        activeColor="text-[#22D3EE] bg-white/[0.03] border-white/[0.04]"
                      />
                      {/* Pulsing gold dot */}
                      {!showSettings && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#22D3EE] border-[1.5px] border-zinc-900 pointer-events-none">
                          <span className="block w-full h-full rounded-full bg-[#22D3EE] animate-ping opacity-60" />
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Microphone icon */}
                  <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.03)' }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    className="p-1.5 rounded-xl text-zinc-500 hover:text-white transition-all shrink-0 cursor-pointer"
                    title="Voice Input"
                  >
                    <Mic size={15} />
                  </motion.button>

                  {/* Stop / Submit */}
                  {(isLoading || canSubmit) && (
                    <div className="flex items-center gap-1.5">
                      {isLoading ? (
                        <motion.button
                          whileHover={{ scale: 1.02, backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={onStop}
                          className="h-8 px-4 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center gap-1.5 border border-red-500/20 text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer"
                        >
                          <StopCircle className="w-3.5 h-3.5 animate-pulse" />
                          Stop
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ scale: canSubmit ? 1.05 : 1, boxShadow: canSubmit ? '0 0 12px rgba(34, 211, 238, 0.2)' : 'none' }}
                          whileTap={{ scale: canSubmit ? 0.95 : 1 }}
                          type="submit"
                          disabled={!canSubmit}
                          className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all border cursor-pointer ${
                            canSubmit
                              ? 'bg-[#22D3EE] text-black border-[#22D3EE] font-bold'
                              : 'bg-white/5 border-transparent text-zinc-600 cursor-not-allowed'
                          }`}
                        >
                          <Send size={13} strokeWidth={2.5} />
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.form>

        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*/*" />
      </div>
    </div>
  );
};

/* ── Section label ───────────────────────────────────────────────────────── */
const SectionLabel: React.FC<{ icon: React.ReactNode; label: string; color: string }> = ({ icon, label, color }) => (
  <div className={`flex items-center gap-1.5 ${color}`}>
    {icon}
    <span className="text-[8px] font-black uppercase tracking-[0.25em] opacity-80">{label}</span>
  </div>
);

/* ── Reusable param slider ───────────────────────────────────────────────── */
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

/* ── Toolbar icon button ─────────────────────────────────────────────────── */
const ToolButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  activeColor: string;
}> = ({ active, onClick, title, icon, activeColor }) => (
  <motion.button
    whileTap={{ scale: 0.93 }}
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-lg border transition-all duration-200 ${
      active
        ? `${activeColor} border`
        : 'text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted/40 border-transparent'
    }`}
  >
    {icon}
  </motion.button>
);
