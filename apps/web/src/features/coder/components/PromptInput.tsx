/**
 * @file src/features/coder/components/PromptInput.tsx
 * @description Prompt pill with LM Studio-style per-model inference settings panel.
 *   Settings panel appears above the whole pill (same level as model selector),
 *   resets per local model switch, only visible when a GGUF local model is active.
 *   Enriched with high-fidelity, Granola-style micro-animations and interactions.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Settings as SettingsIcon,
  Check,
  StopCircle,
  Paperclip,
  X,
  Zap,
  Info,
  ChevronDown,
  Bot,
  Globe,
  Mic,
  SlidersHorizontal,
  MemoryStick,
  Cpu,
  Thermometer,
  Layers,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { ModelSelector } from '@src/shared/components/ModelSelector';
import { ModelDefinition } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { analyzePrompt, optimizePromptText } from '@nyx/shared';
import { AgentModeBadge } from './AgentModeBadge';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { initVoiceMode } from '@src/features/voice/vad';

/* ── Types ───────────────────────────────────────────────────────────────── */
interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (
    finalPrompt: string,
    images?: Array<{ name: string; dataUrl: string; mimeType?: string }>
  ) => void;
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
  agentMode?: 'chat' | 'coder' | 'architect' | null;
  agentReasoning?: string;
  missingDebugWarning?: { prompt: string } | null;
  setMissingDebugWarning?: (warning: { prompt: string } | null) => void;
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

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  type: string;
}

/* ── Staggered Entrance Variants for Granola Tags ───────────────────────── */
const tagContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

const tagItemVariants = {
  hidden: { opacity: 0, x: -10, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 },
  },
};

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
  codebaseKnowledgeEnabled,
  onCodebaseKnowledgeToggle,
  mode,
  alignDropdown = 'top',
  agentMode = null,
  agentReasoning = '',
  missingDebugWarning,
  setMissingDebugWarning,
}) => {
  const { workspacePath } = useNyxStore();
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [showSettings, setShowSettings] = useState(false);
  const [attachedImages, setAttachedImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isSubmitting = useRef(false);
  const localSettings = modelSettings;
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const vadRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [templateSelectedIndex, setTemplateSelectedIndex] = useState(0);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetchWithAuth('/api/v1/prompt-templates');
        if (response.ok) {
          const data = await response.json();
          setPromptTemplates(data);
        }
      } catch (err) {
        console.error('Failed to fetch prompt templates', err);
      }
    };
    fetchTemplates();
  }, []);

  /* ── Detect local GGUF model ─────────────────────────────────────────── */
  const providerStr = String(currentModel?.provider ?? '');
  const isLocalModel = !!(
    currentModelId &&
    (providerStr === 'local' || providerStr === 'nyx-native' || (!currentModel && currentModelId))
  );

  /* ── Reset settings when switching local models ──────────────────────── */
  useEffect(() => {
    if (isLocalModel) {
      setShowSettings(false);
    }
  }, [currentModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoice = useCallback(async () => {
    if (isVoiceActive) {
      if (vadRef.current) {
        vadRef.current.pause();
        vadRef.current = null;
      }
      setIsVoiceActive(false);
      toast.info('Voice input stopped');
    } else {
      setIsVoiceActive(true);
      toast.success('Listening... Start speaking');
      try {
        const myvad = await initVoiceMode((audio) => {
          toast.info('Processing speech...');
          // Mock sending to backend for whisper:
          // In real implementation, this would POST audio to backend whisper route
          onPromptChange(prompt + (prompt ? ' ' : '') + '[Voice Input Captured]');
        });
        vadRef.current = myvad;
        if (myvad) myvad.start();
      } catch (err) {
        toast.error('Failed to initialize microphone');
        setIsVoiceActive(false);
      }
    }
  }, [isVoiceActive, prompt, onPromptChange]);

  /* ── Close settings if user switches to a cloud model ───────────────── */
  useEffect(() => {
    if (!isLocalModel && showSettings) {
      setShowSettings(false);
    }
  }, [isLocalModel]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Global keyboard shortcuts ────────────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowModelSelector((v) => !v);
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

  // Listen for global open selector events
  useEffect(() => {
    const handleOpenSelector = () => {
      setShowModelSelector(true);
      setShowSettings(false);
    };
    window.addEventListener('nyx:open-model-selector', handleOpenSelector);
    return () => {
      window.removeEventListener('nyx:open-model-selector', handleOpenSelector);
    };
  }, []);

  const analysis = prompt ? analyzePrompt(prompt) : null;
  const isHardware = analysis?.hardware?.isHardware || false;

  const updateLocal = useCallback(
    <K extends keyof LocalInferenceSettings>(key: K, value: LocalInferenceSettings[K]) => {
      onModelSettingsChange({ ...modelSettings, [key]: value });
    },
    [modelSettings, onModelSettingsChange]
  );

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
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are supported');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImages(prev => [...prev, { file, preview: event.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    toast.success(`Attached ${files.length} image(s)`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canSubmit = !!prompt.trim() && !!currentModelId && !isLoading;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit || isSubmitting.current) return;

      const finalPrompt = prompt.trim();
      if (!finalPrompt) return;

      isSubmitting.current = true;
      setShowModelSelector(false);
      setShowSettings(false);

      let images: Array<{ name: string; dataUrl: string; mimeType?: string }> | undefined;

      if (attachedImages.length > 0) {
        images = attachedImages.map(img => ({
          name: img.file.name,
          mimeType: img.file.type,
          dataUrl: img.preview,
        }));
      }

      onSubmit(finalPrompt, images);
      setAttachedImages([]);

      setTimeout(() => {
        isSubmitting.current = false;
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }, 100);
    },
    [prompt, onSubmit, canSubmit]
  );

  const adjustHeight = (reset?: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (reset) {
      ta.style.height = '36px';
      return;
    }
    ta.style.height = '36px';
    ta.style.height = `${Math.max(36, Math.min(ta.scrollHeight, 220))}px`;
  };

  /* ── GPU label helpers ───────────────────────────────────────────────── */
  const gpuModeLabel =
    localSettings.gpuLayers === 0
      ? 'CPU Only'
      : localSettings.gpuLayers < 20
        ? 'Minimal'
        : localSettings.gpuLayers < 50
          ? 'Partial'
          : localSettings.gpuLayers < 90
            ? 'Balanced'
            : 'Full VRAM';
  const gpuColor =
    localSettings.gpuLayers === 0
      ? 'text-zinc-400'
      : localSettings.gpuLayers < 50
        ? 'text-accent/70'
        : 'text-accent';

  const visibleTemplates = prompt.startsWith('/')
    ? promptTemplates.filter(
        (t) =>
          t.name.toLowerCase().includes(prompt.slice(1).toLowerCase()) ||
          t.content.toLowerCase().includes(prompt.slice(1).toLowerCase())
      )
    : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (visibleTemplates.length > 0 && prompt.startsWith('/')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTemplateSelectedIndex((prev) => Math.min(prev + 1, visibleTemplates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTemplateSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selected = visibleTemplates[templateSelectedIndex];
        if (selected) {
          onPromptChange(selected.content);
          setTimeout(() => textareaRef.current?.focus(), 0);
        }
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="shrink-0 w-full flex flex-col items-center px-4 pb-4 pt-2 bg-background z-30 gap-2">
      <AgentModeBadge mode={agentMode} reasoning={agentReasoning} isLoading={isLoading} />
      <div
        className={`relative w-full transition-all duration-500 ease-out ${prompt.trim().length > 0 ? 'max-w-3xl' : 'max-w-2xl'}`}
      >
        {/* ── Hardware critique panel ─────────────────────────────────── */}
        <AnimatePresence>
          {isHardware && analysis && analysis.hardware && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: 8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              className="mb-3 overflow-hidden rounded-md border border-primary/20 bg-zinc-900/90 backdrop-blur-xl shadow-sm border border-border"
            >
              <div className="p-4">
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-md bg-primary/60 opacity-75" />
                      <span className="relative inline-flex rounded-md h-2 w-2 bg-primary" />
                    </span>
                    <Bot className="w-3.5 h-3.5 text-primary" />
                    <span className="font-extrabold text-[10px] uppercase tracking-widest text-primary">
                      NYX Hardware Analyzer
                    </span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    type="button"
                    onClick={() => {
                      const promptAnalysis = analyzePrompt(prompt);
                      onPromptChange(optimizePromptText(prompt, promptAnalysis));
                      toast.success('Prompt optimized!');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/45 text-[9px] font-black uppercase tracking-widest text-primary transition-all"
                  >
                    <Zap className="w-3 h-3 text-accent fill-accent animate-pulse" />
                    Auto-Optimize Spec
                  </motion.button>
                </div>
                <div className="space-y-3 max-h-[180px] overflow-y-auto scrollbar-none pr-1">
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.hardware.detectedPlatforms.map((p: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-cyan-500/8 border border-cyan-500/15 text-[8px] font-bold uppercase tracking-wider text-cyan-400"
                      >
                        Host: {p}
                      </span>
                    ))}
                    {analysis.hardware.detectedComponents.map((c: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-primary/5 border border-primary/15 text-[8px] font-bold uppercase tracking-wider text-primary"
                      >
                        Component: {c}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {analysis.hardware.gaps.map((gap: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-[10px] text-yellow-200/90 bg-yellow-500/4 p-2 rounded-md border border-yellow-500/10"
                      >
                        <span className="shrink-0">⚠</span>
                        <span className="leading-relaxed">{gap}</span>
                      </div>
                    ))}
                    {analysis.hardware.safetyHazards.map((h: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-[10px] text-red-200/90 bg-red-500/4 p-2 rounded-md border border-red-500/10"
                      >
                        <span className="shrink-0">!</span>
                        <span className="leading-relaxed">{h}</span>
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
              onResetContext={() => {
                onClearHistory();
                toast.success('Context reset');
              }}
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
              <div className="fixed inset-0 z-[499]" onClick={() => setShowSettings(false)} />

              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute bottom-full mb-3 left-0 right-0 z-[500] bg-card border border-white/[0.04] p-1 rounded-md shadow-sm border border-border overflow-hidden"
              >
                <div className="w-full bg-card/98 border border-white/[0.04] rounded-[calc(1.5rem-4px)] overflow-hidden">
                  <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
                        <SlidersHorizontal size={13} className="text-accent" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground/85">
                          Local Inference
                        </p>
                        <p className="text-[8px] text-accent/80 font-semibold uppercase tracking-wider mt-0.5">
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
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider text-muted-foreground/35 hover:text-accent hover:bg-accent/8 border border-transparent hover:border-accent/15 transition-all"
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
                            color="text-accent"
                          />
                          <div className="mt-3 p-3.5 rounded-md bg-accent/[0.04] border border-accent/10 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                                GPU Layers (ngl)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[8px] font-black uppercase tracking-wider ${gpuColor}`}
                                >
                                  {gpuModeLabel}
                                </span>
                                <span className="text-[10px] font-mono font-bold text-foreground/45 tabular-nums">
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
                              className="w-full h-1.5 rounded-md appearance-none cursor-pointer accent-accent bg-white/8"
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

                        <section>
                          <SectionLabel
                            icon={<Layers size={9} />}
                            label="Context & Memory"
                            color="text-[#FF3366]"
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
                              accent="accent-[#FF3366]"
                              onChange={(v) => updateLocal('contextSize', v)}
                            />
                          </div>
                        </section>

                        <section>
                          <SectionLabel
                            icon={<Cpu size={9} />}
                            label="CPU Compute"
                            color="text-[#FF3366]"
                          />
                          <div className="mt-3 space-y-4">
                            <ParamSlider
                              label="CPU Threads"
                              hint="Parallel threads for CPU inference layers."
                              value={localSettings.threads}
                              min={1}
                              max={32}
                              step={1}
                              display={(v) => `${v}`}
                              accent="accent-[#FF3366]"
                              onChange={(v) => updateLocal('threads', v)}
                            />
                            <ParamSlider
                              label="Batch Size"
                              hint="Tokens per step during prompt prefill."
                              value={localSettings.batchSize}
                              min={64}
                              max={2048}
                              step={64}
                              display={(v) => `${v}`}
                              accent="accent-[#FF3366]"
                              onChange={(v) => updateLocal('batchSize', v)}
                            />
                          </div>
                        </section>
                      </div>

                      <div className="space-y-6">
                        <section>
                          <SectionLabel
                            icon={<Thermometer size={9} />}
                            label="Sampling"
                            color="text-[#FF3366]"
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
                              accent="accent-[#FF3366]"
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
                              accent="accent-[#FF3366]"
                              onChange={(v) => updateLocal('topP', v)}
                              isFloat
                            />
                            <ParamSlider
                              label="Top-K"
                              hint="Sample from top K tokens only. 0 = disabled."
                              value={localSettings.topK ?? 40}
                              min={0}
                              max={200}
                              step={1}
                              display={(v) => `${v ?? 40}`}
                              accent="accent-[#FF3366]"
                              onChange={(v) => updateLocal('topK', v)}
                            />
                            <ParamSlider
                              label="Repeat Penalty"
                              hint="Penalises recently used tokens. > 1.0 reduces repetition."
                              value={localSettings.repeatPenalty ?? 1.1}
                              min={1}
                              max={2}
                              step={0.05}
                              display={(v) => (v ?? 1.1).toFixed(2)}
                              accent="accent-accent"
                              onChange={(v) => updateLocal('repeatPenalty', v)}
                              isFloat
                            />

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <span className="text-[8px] font-bold text-muted-foreground/55 uppercase tracking-wider">
                                    Mirostat
                                  </span>
                                  <p className="text-[7px] text-muted-foreground/28 mt-0.5">
                                    Adaptive sampler — overrides Top-P / Top-K.
                                  </p>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-foreground/40 tabular-nums">
                                  {localSettings.mirostat === 0
                                    ? 'Off'
                                    : `v${localSettings.mirostat}`}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                {([0, 1, 2] as const).map((v) => (
                                  <motion.button
                                    key={v}
                                    whileTap={{ scale: 0.9 }}
                                    type="button"
                                    onClick={() => updateLocal('mirostat', v)}
                                    className={`flex-1 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-all ${
                                      localSettings.mirostat === v
                                        ? 'bg-accent/15 text-accent border border-accent/30'
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

                    <div className="mt-5 pt-4 border-t border-white/[0.04] flex items-start gap-2 px-6 pb-5">
                      <Info size={9} className="text-muted-foreground/20 mt-0.5 shrink-0" />
                      <p className="text-[7px] text-muted-foreground/20 leading-relaxed">
                        GPU Layers apply when the model is loaded into Resident RAM + VRAM. All
                        other sampling parameters take effect on the next generation. Settings reset
                        automatically when you switch models.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Granola-Style Dark Mode Prompt Capsule ─────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          layout
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="relative w-full"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = e.dataTransfer.files;
            if (!files || files.length === 0) return;

            let addedCount = 0;
            Array.from(files).forEach(file => {
              if (!file.type.startsWith('image/')) return;
              addedCount++;
              const reader = new FileReader();
              reader.onload = (event) => {
                setAttachedImages(prev => [...prev, { file, preview: event.target?.result as string }]);
              };
              reader.readAsDataURL(file);
            });
            if (addedCount > 0) {
              toast.success(`Attached via Drop: ${addedCount} image(s)`);
            } else {
              toast.error('Only image files are supported');
            }
          }}
        >
          {visibleTemplates.length > 0 && prompt.startsWith('/') && (
            <div role="listbox" aria-label="Prompt templates" className="absolute bottom-[calc(100%+8px)] left-0 w-full md:w-3/4 max-h-60 overflow-y-auto bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-md shadow-sm border border-border z-50 flex flex-col p-1.5 scrollbar-none">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                <Layers size={14} className="text-zinc-400" />
                <span className="text-xs font-bold text-zinc-300">Prompt Templates</span>
              </div>
              <div className="flex flex-col gap-1 mt-1.5">
                {visibleTemplates.map((t, idx) => (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={idx === templateSelectedIndex}
                    onClick={() => {
                      onPromptChange(t.content);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                    onMouseEnter={() => setTemplateSelectedIndex(idx)}
                    className={`flex flex-col text-left px-3 py-2 rounded-md transition-all ${
                      idx === templateSelectedIndex
                        ? 'bg-white/10 text-white'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-sm font-semibold">{t.name}</span>
                    <span className="text-xs opacity-70 line-clamp-1">{t.content}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Outer capsule wrapper */}
          <div
            className={`w-full flex flex-col bg-card/60 backdrop-blur-xl border rounded-[24px] p-1.5 shadow-sm border border-border transition-all duration-300 ${
              isDragging
                ? 'border-accent shadow-[0_0_24px_rgba(var(--accent-rgb),0.2)] bg-accent/5'
                : 'border-border focus-within:border-border/80'
            }`}
          >
            {/* Top row of interactive feature pills (tags) - Staggered mount animations */}
            <motion.div
              variants={tagContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center justify-between px-3 py-2 border-b border-white/[0.03] overflow-x-auto gap-3 scrollbar-none select-none"
            >
              <div className="flex items-center gap-2">
                {/* Tag 1: List Tasks */}
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  aria-label="List tasks"
                  onClick={() => {
                    onPromptChange('List active tasks and show current workspace status.');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/[0.03] border border-emerald-500/10 hover:border-emerald-500/25 transition-all text-left text-zinc-300 hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500/15 flex items-center justify-center text-[9px] font-black text-emerald-400 leading-none font-mono">
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">List tasks</span>
                </motion.button>

                {/* Tag 2: Optimize Prompt */}
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  aria-label="Optimize prompt"
                  onClick={() => {
                    if (prompt.trim()) {
                      onPromptChange(optimizePromptText(prompt, analysis || analyzePrompt(prompt)));
                      toast.success('Prompt optimized!');
                    } else {
                      toast.error('Type a prompt first to optimize it');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/[0.03] border border-cyan-500/10 hover:border-cyan-500/25 transition-all text-left text-zinc-300 hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-cyan-500/15 flex items-center justify-center text-[9px] font-black text-cyan-400 leading-none font-mono">
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">Optimize prompt</span>
                </motion.button>

                {/* Tag 3: Codebase Search */}
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  aria-label="Toggle codebase search"
                  onClick={() => {
                    onCodebaseKnowledgeToggle(!codebaseKnowledgeEnabled);
                    toast.success(
                      `Codebase knowledge ${!codebaseKnowledgeEnabled ? 'enabled' : 'disabled'}`
                    );
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-left cursor-pointer shrink-0 ${
                    codebaseKnowledgeEnabled
                      ? 'bg-purple-500/10 border border-purple-500/35 text-white'
                      : 'bg-purple-500/[0.03] border border-purple-500/10 text-zinc-300 hover:text-white hover:border-purple-500/25'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-black leading-none font-mono ${
                      codebaseKnowledgeEnabled
                        ? 'bg-purple-500 text-black font-extrabold'
                        : 'bg-purple-500/15 text-purple-400'
                    }`}
                  >
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">Codebase search</span>
                </motion.button>

                {/* Web Search Toggle Tag */}
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  aria-label="Toggle web search"
                  onClick={() => {
                    onWebSearchToggle(!webSearchEnabled);
                    toast.success(`Web search ${!webSearchEnabled ? 'enabled' : 'disabled'}`);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-left cursor-pointer shrink-0 ${
                    webSearchEnabled
                      ? 'bg-sky-500/10 border border-sky-500/35 text-white'
                      : 'bg-sky-500/[0.03] border border-sky-500/10 text-zinc-300 hover:text-white hover:border-sky-500/25'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-black leading-none font-mono ${
                      webSearchEnabled
                        ? 'bg-sky-500 text-black font-extrabold'
                        : 'bg-sky-500/15 text-sky-400'
                    }`}
                  >
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">Web search</span>
                </motion.button>

                {/* Tag 4: Reset Context */}
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  aria-label="Reset context"
                  onClick={() => {
                    onClearHistory();
                    onPromptChange('');
                    toast.success('Context reset');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/[0.03] border border-amber-500/10 hover:border-amber-500/25 transition-all text-left text-zinc-300 hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-amber-500/15 flex items-center justify-center text-[9px] font-black text-amber-400 leading-none font-mono">
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">Reset context</span>
                </motion.button>
              </div>
            </motion.div>

            <div
              className={`w-full bg-background border rounded-[16px] p-3 mt-1.5 flex flex-col gap-2 relative shadow-inner transition-all duration-300 ${
                isFocused
                  ? 'border-accent/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02),0_0_16px_rgba(var(--accent-rgb),0.06)]'
                  : 'border-border/50'
              }`}
            >
              {/* Slash Command Menu */}
              <AnimatePresence>
                {prompt.startsWith('/') && isFocused && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    className="absolute bottom-full left-0 mb-2 w-64 bg-zinc-900 border border-white/10 rounded-md shadow-sm border border-border overflow-hidden z-50 flex flex-col"
                  >
                    <div className="px-3 py-2 border-b border-white/5 bg-white/5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        Slash Commands
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onPromptChange('');
                        setTimeout(() => {
                          onPromptChange(
                            optimizePromptText(prompt, analysis || analyzePrompt(prompt))
                          );
                          toast.success('Prompt optimized!');
                        }, 50);
                      }}
                      className="px-3 py-2.5 text-left text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5"
                    >
                      <span className="text-cyan-400 font-mono mr-2">/optimize</span> Optimize
                      current prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPromptChange('');
                        onClearHistory();
                        toast.success('Context reset');
                      }}
                      className="px-3 py-2.5 text-left text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5"
                    >
                      <span className="text-amber-400 font-mono mr-2">/clear</span> Reset context
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPromptChange('');
                        onCodebaseKnowledgeToggle(!codebaseKnowledgeEnabled);
                        toast.success(
                          `Codebase knowledge ${!codebaseKnowledgeEnabled ? 'enabled' : 'disabled'}`
                        );
                      }}
                      className="px-3 py-2.5 text-left text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <span className="text-purple-400 font-mono mr-2">/codebase</span> Toggle
                      codebase search
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              {isDragging && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] rounded-[16px] flex items-center justify-center z-50 border border-dashed border-accent/30 pointer-events-none">
                  <span className="text-xs font-black uppercase tracking-widest text-accent animate-pulse flex items-center gap-2">
                    <Paperclip size={12} /> Drop to attach file
                  </span>
                </div>
              )}

              {/* Missing Debug Details UI */}
              {missingDebugWarning && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, scale: 0.95 }}
                  animate={{ opacity: 1, height: 'auto', scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.95 }}
                  className="flex flex-col gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md mt-1 mb-2 overflow-hidden"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-red-200 font-medium">Missing Debug Details</p>
                      <p className="text-[11px] text-red-300/80 mt-0.5">
                        Please provide your code, terminal output, or error logs to help me debug effectively.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setMissingDebugWarning?.(null)}
                      className="px-3 py-1.5 bg-background/50 hover:bg-background border border-white/5 text-zinc-300 text-[10px] uppercase font-bold tracking-wider rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('nyx-force-continue', {
                            detail: { prompt: missingDebugWarning.prompt },
                          })
                        );
                        setMissingDebugWarning?.(null);
                      }}
                      className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[10px] uppercase font-bold tracking-wider rounded-md transition-colors flex items-center gap-1.5"
                    >
                      <Zap size={10} />
                      Force Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Attached Images */}
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2 pb-1">
                  <AnimatePresence>
                    {attachedImages.map((img, idx) => (
                      <motion.div
                        key={img.file.name + idx}
                        initial={{ opacity: 0, scale: 0.9, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -4 }}
                        className="relative group"
                      >
                        <img 
                          src={img.preview} 
                          alt={img.file.name} 
                          className="w-12 h-12 object-cover rounded-md border border-border"
                        />
                        <button
                          type="button"
                          onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-background border border-border rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5 text-zinc-400 hover:text-white"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Microphone dictation button - absolute top right */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 group/mic z-10 select-none">
                <div className="flex items-center gap-[1.5px] h-2.5 opacity-0 group-hover/mic:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <span className="w-[1.5px] h-full bg-emerald-400 rounded-md animate-[bounce_0.6s_infinite_100ms]" />
                  <span className="w-[1.5px] h-full bg-emerald-400 rounded-md animate-[bounce_0.6s_infinite_300ms]" />
                  <span className="w-[1.5px] h-full bg-emerald-400 rounded-md animate-[bounce_0.6s_infinite_200ms]" />
                </div>

                <motion.button
                  whileHover={{ scale: 1.08, color: '#FFFFFF' }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={toggleVoice}
                  className={`transition-all cursor-pointer p-1 ${isVoiceActive ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title={isVoiceActive ? "Stop Voice Input" : "Voice Input"}
                  aria-label="Voice Input"
                >
                  <Mic size={14} className={isVoiceActive ? 'animate-pulse' : ''} />
                </motion.button>
              </div>

              {/* Attachment & Submit / Stop controls - absolute bottom right */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10 select-none">
                {/* Upload file button */}
                <motion.button
                  whileHover={{ scale: 1.08, color: '#FFFFFF' }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer p-1"
                  title="Upload File"
                  aria-label="Upload File"
                >
                  <Paperclip size={14} />
                </motion.button>

                {/* Submit / Stop button */}
                {isLoading ? (
                  <motion.button
                    whileHover={{
                      scale: 1.02,
                      backgroundColor: 'rgba(239,68,68,0.15)',
                      borderColor: 'rgba(239,68,68,0.3)',
                    }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={onStop}
                    aria-label="Stop generation"
                    className="h-7 px-3 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center gap-1 border border-red-500/20 text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer"
                  >
                    <StopCircle className="w-3 h-3 animate-pulse" />
                    Stop
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{
                      scale: canSubmit ? 1.05 : 1,
                      boxShadow: canSubmit ? '0 0 10px rgba(var(--accent-rgb), 0.25)' : 'none',
                    }}
                    whileTap={{ scale: canSubmit ? 0.95 : 1 }}
                    type="submit"
                    disabled={!canSubmit}
                    aria-label="Send prompt"
                    className={`h-7 w-7 rounded-md flex items-center justify-center transition-all border cursor-pointer ${
                      canSubmit
                        ? 'bg-accent text-white border-accent font-bold'
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
                  aria-label="Select model"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModelSelector((v) => !v);
                    setShowSettings(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/5 text-[10px] font-bold text-zinc-300 transition-all select-none cursor-pointer"
                >
                  {currentModel ? (
                    getCustomModelIcon(currentModel)
                  ) : (
                    <Bot className="w-3 h-3 text-zinc-500" />
                  )}
                  <span className="truncate max-w-[150px]">
                    {currentModel?.name || 'Select model'}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-40 shrink-0" />
                </motion.button>

                {/* Configure settings indicator (local-only) */}
                {isLocalModel && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    aria-label="Configure local model settings"
                    onClick={() => {
                      setShowSettings((v) => !v);
                      setShowModelSelector(false);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                      showSettings
                        ? 'bg-accent/10 text-accent border border-accent/30'
                        : 'bg-secondary/30 border border-border text-zinc-400 hover:text-white'
                    }`}
                  >
                    <SlidersHorizontal size={9} />
                    <span>Configure</span>
                  </motion.button>
                )}
              </div>

              <div className="flex items-start gap-1.5 px-1 pr-16">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  aria-label="Prompt input"
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onChange={(e) => {
                    onPromptChange(e.target.value);
                    adjustHeight();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type / for actions, Cmd+Enter to send..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1.5 px-1 resize-none min-h-[36px] max-h-[220px] font-medium outline-none text-foreground/90 placeholder:text-zinc-600 focus:outline-none"
                  style={{ scrollbarWidth: 'none' }}
                />
              </div>
            </div>
          </div>
        </motion.form>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept="image/*"
          multiple
        />
      </div>
    </div>
  );
};

/* ── Section label ───────────────────────────────────────────────────────── */
const SectionLabel: React.FC<{ icon: React.ReactNode; label: string; color: string }> = ({
  icon,
  label,
  color,
}) => (
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
        <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-wider">
          {label}
        </span>
        <p className="text-[7px] text-muted-foreground/30 mt-0.5 leading-snug">{hint}</p>
      </div>
      <span className="text-[10px] font-mono font-bold text-foreground/50 ml-3 shrink-0 tabular-nums">
        {display(value)}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) =>
        onChange(isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
      }
      className={`w-full h-1.5 rounded-md appearance-none cursor-pointer bg-white/8 ${accent}`}
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
    className={`p-1.5 rounded-md border transition-all duration-200 ${
      active
        ? `${activeColor} border`
        : 'text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted/40 border-transparent'
    }`}
  >
    {icon}
  </motion.button>
);
