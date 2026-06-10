// fallow-ignore-file code-duplication
// @ts-nocheck
/**
 * @file src/features/chat/components/ChatPromptInput.tsx
 * @description Prompt pill with inference settings panel, tailored specifically for the Chat Agent.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  StopCircle,
  X,
  Zap,
  Info,
  ChevronDown,
  Bot,
  Mic,
  SlidersHorizontal,
  MemoryStick,
  Cpu,
  Thermometer,
  Layers,
  RotateCcw,
  Check,
  Image as ImageIcon,
} from 'lucide-react';

import { ModelDefinition } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { analyzePrompt } from '@shared/promptAnalyzer';
const optimizePromptText = async (text: string) => text;
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { PromptTemplateManager } from './PromptTemplateManager';
import { SectionLabel, ParamSlider, ToolButton } from '@shared/components/PromptInputSubcomponents';
import { LocalModelSettingsPanel } from '@shared/components/LocalModelSettingsPanel';
import { initVoiceMode } from '@src/features/voice/vad';
import { SpeechToTextHelper } from '@src/features/voice/speechToText';


interface ChatPromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (
    finalPrompt: string,
    images?: { name: string; mimeType: string; data: string }[]
  ) => void;
  isLoading: boolean;
  onStop: () => void;
  currentModelId: string | null;
  currentModel: ModelDefinition | null;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  onModelSelect: (id: string) => void;
  onClearHistory: () => void;
  onModelSettingsChange: (settings: any) => void;
  modelSettings: any;
  suggestedPrompts: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
  getCustomModelIcon: (model: ModelDefinition | null | undefined) => React.ReactNode;
  alignDropdown?: 'top' | 'bottom';
  pendingImages?: { name: string; mimeType: string; data: string }[];
  onRemoveImage?: (index: number) => void;
  onImagesChange?: (images: { name: string; mimeType: string; data: string }[]) => void;
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
    },
  },
};

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  type: string;
}

const tagItemVariants = {
  hidden: { opacity: 0, x: -10, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 25 },
  },
};

export const ChatPromptInput: React.FC<ChatPromptInputProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading,
  onStop,
  currentModelId,
  currentModel,
  providerStatuses,
  gatewayUrls,
  onModelSelect,
  onClearHistory,
  onModelSettingsChange,
  modelSettings,
  getCustomModelIcon,
  alignDropdown = 'top',
  pendingImages,
  onRemoveImage,
  onImagesChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isSubmitting = useRef(false);
  const localSettings = modelSettings;

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState<'browser' | 'vad'>('browser');
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const vadRef = useRef<any>(null);
  const sttRef = useRef<any>(null);
  const basePromptRef = useRef('');

  useEffect(() => {
    return () => {
      if (vadRef.current) vadRef.current.pause();
      if (sttRef.current) sttRef.current.stop();
    };
  }, []);

  const toggleVoice = useCallback(async () => {
    if (isVoiceActive) {
      if (voiceEngine === 'vad') {
        if (vadRef.current) {
          vadRef.current.pause();
          vadRef.current = null;
        }
      } else {
        if (sttRef.current) {
          sttRef.current.stop();
          sttRef.current = null;
        }
      }
      setIsVoiceActive(false);
      toast.info('Voice input stopped');
    } else {
      setIsVoiceActive(true);
      basePromptRef.current = prompt;

      if (voiceEngine === 'vad') {
        toast.success('Local VAD Listening... Start speaking');
        try {
          const myvad = await initVoiceMode((audio) => {
            toast.info('Processing speech (Local VAD)...');
            onPromptChange(basePromptRef.current + (basePromptRef.current ? ' ' : '') + '[Voice Input Captured]');
          });
          vadRef.current = myvad;
          if (myvad) myvad.start();
        } catch (err) {
          toast.error('Failed to initialize microphone');
          setIsVoiceActive(false);
        }
      } else {
        toast.success('Speech-to-Text active... Speak now');
        try {
          const helper = new SpeechToTextHelper({
            onResult: (text, isFinal) => {
              onPromptChange(basePromptRef.current + (basePromptRef.current ? ' ' : '') + text);
            },
            onEnd: () => {
              setIsVoiceActive(false);
            },
            onError: (err) => {
              toast.error(err);
              setIsVoiceActive(false);
            }
          });
          sttRef.current = helper;
          helper.start();
        } catch (err) {
          toast.error('Speech Recognition not supported or failed');
          setIsVoiceActive(false);
        }
      }
    }
  }, [isVoiceActive, voiceEngine, prompt, onPromptChange]);


  const [visibleTemplates, setVisibleTemplates] = useState<PromptTemplate[]>([]);
  const [templateSelectedIndex, setTemplateSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [localSelectedImages, setLocalSelectedImages] = useState<
    { name: string; mimeType: string; data: string }[]
  >([]);

  const selectedImages = pendingImages ?? localSelectedImages;

  const updateImages = useCallback(
    (
      updater:
        | { name: string; mimeType: string; data: string }[]
        | ((
            prev: { name: string; mimeType: string; data: string }[]
          ) => { name: string; mimeType: string; data: string }[])
    ) => {
      const nextImages = typeof updater === 'function' ? updater(selectedImages) : updater;
      if (pendingImages !== undefined) {
        if (onImagesChange) {
          onImagesChange(nextImages);
        }
      } else {
        setLocalSelectedImages(nextImages);
      }
    },
    [selectedImages, pendingImages, onImagesChange]
  );

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    try {
      const file = files[0];

      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image size must be less than 10MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const rawBase64 = event.target?.result as string;
          const base64Data = rawBase64.split(',')[1];

          const res = await fetchWithAuth('/api/v1/files/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: file.name,
              mimeType: file.type,
              data: base64Data,
            }),
          });

          if (!res.ok) {
            throw new Error(`Failed to upload: ${res.statusText}`);
          }

          const data = await res.json();
          if (data.success) {
            updateImages((prev) => [
              ...prev,
              {
                name: data.name,
                mimeType: data.mimeType,
                data: base64Data, // Use local base64Data since server response does not contain it
              },
            ]);
            toast.success(`File "${file.name}" attached successfully`);
          } else {
            throw new Error(data.error || 'Upload failed');
          }
        } catch (error: any) {
          toast.error(`File upload failed: ${error.message}`);
        } finally {
          setIsUploadingImage(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(`File reading failed: ${error.message}`);
      setIsUploadingImage(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    if (onRemoveImage) {
      onRemoveImage(index);
    } else {
      updateImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const providerStr = String(currentModel?.provider ?? '');
  const isLocalModel = !!(
    currentModelId &&
    (providerStr === 'ollama' || providerStr === 'lmstudio' || (!currentModel && currentModelId))
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
      setShowSettings(false);

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

  const updateLocal = useCallback(
    <K extends string>(key: K, value: LocalInferenceSettings[K]) => {
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

  const adjustHeight = (reset?: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (reset) {
      ta.style.height = '36px';
      return;
    }
    ta.style.height = '36px';
    ta.style.height = `${Math.max(36, Math.min(ta.scrollHeight, 150))}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (visibleTemplates.length > 0 && prompt.startsWith('/')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTemplateSelectedIndex((i) => Math.min(i + 1, visibleTemplates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTemplateSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const t = visibleTemplates[templateSelectedIndex];
        if (t) {
          onPromptChange(t.content);
          setTimeout(() => textareaRef.current?.focus(), 0);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if ((!prompt.trim() && selectedImages.length === 0) || isLoading || isSubmitting.current)
      return;
    if (!currentModelId) {
      toast.error('Please select a model first');
      return;
    }

    isSubmitting.current = true;
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      onSubmit(prompt, selectedImages);
      updateImages([]);
      adjustHeight(true);
    } finally {
      setTimeout(() => {
        isSubmitting.current = false;
      }, 500);
    }
  };

  const canSubmit =
    (!!prompt.trim() || selectedImages.length > 0) && !!currentModelId && !isLoading;

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
        ? 'text-primary/70'
        : 'text-primary';

  return (
    <div className="shrink-0 w-full flex flex-col items-center px-4 pb-4 pt-2 bg-background z-30 gap-2">
      <div
        className={`relative w-full transition-all duration-500 ease-out ${prompt.trim().length > 0 ? 'max-w-2xl' : 'max-w-xl'}`}
      >
        {/* ── Settings Panel ────────────────────────────────────────── */}
        <LocalModelSettingsPanel
          isLocalModel={isLocalModel}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          currentModelId={currentModelId}
          onModelSelect={onModelSelect}
          modelSettings={modelSettings}
          onModelSettingsChange={onModelSettingsChange}
          resetLocalSettings={resetLocalSettings}
          gpuModeLabel={gpuModeLabel}
          updateLocal={updateLocal}
        />

        {/* ── Chat Prompt Capsule ─────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          layout
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="relative w-full"
        >
          {visibleTemplates.length > 0 && prompt.startsWith('/') && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 w-full max-h-60 overflow-y-auto bg-popover/90 backdrop-blur-xl border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.04)] z-50 flex flex-col p-2 scrollbar-none">
              <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
                <Layers size={14} className="text-muted-foreground" />
                <span className="text-xs font-bold text-foreground/80">Prompt Templates</span>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                {visibleTemplates.map((t, idx) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onPromptChange(t.content);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                    onMouseEnter={() => setTemplateSelectedIndex(idx)}
                    className={`flex flex-col text-left px-3 py-2 rounded-md transition-all ${
                      idx === templateSelectedIndex
                        ? 'bg-accent/10 text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span className="text-sm font-semibold">{t.name}</span>
                    <span className="text-xs opacity-70 line-clamp-1">{t.content}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="w-full flex flex-col bg-card/60 backdrop-blur-xl border border-border focus-within:border-accent/40 rounded-md p-1 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
            <motion.div
              variants={tagContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center justify-between px-1 py-0.5 border-b border-border/40 overflow-x-auto gap-2 scrollbar-none select-none"
            >
              <div className="flex items-center gap-1.5">
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleImageUploadClick}
                  disabled={isUploadingImage}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-secondary border border-border hover:border-border/80 transition-all text-left text-foreground cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[9.5px] font-bold tracking-tight">{isUploadingImage ? 'Uploading...' : 'Attach File'}</span>
                </motion.button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  className="hidden"
                />

                <div className="flex items-center gap-1">
                  <PromptTemplateManager
                    onSelectTemplate={(content) => {
                      onPromptChange(content);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  />
                </div>

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
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 hover:border-cyan-500/40 transition-all text-left text-cyan-600 dark:text-cyan-300 hover:text-cyan-800 dark:hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-cyan-500/20 flex items-center justify-center text-[9px] font-black text-cyan-600 dark:text-cyan-400 leading-none font-mono">
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">Optimize prompt</span>
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
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/40 transition-all text-left text-amber-600 dark:text-amber-300 hover:text-amber-800 dark:hover:text-white cursor-pointer shrink-0"
                >
                  <span className="w-3.5 h-3.5 rounded bg-amber-500/20 flex items-center justify-center text-[9px] font-black text-amber-600 dark:text-amber-400 leading-none font-mono">
                    /
                  </span>
                  <span className="text-[9.5px] font-bold tracking-tight">Reset context</span>
                </motion.button>

              </div>

              <div className="flex items-center gap-2">
                {/* Voice Input Tag with Dropdown */}
                <div className="relative flex items-center shrink-0">
                  <motion.button
                    variants={tagItemVariants}
                    whileHover={{ y: -1.5, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={toggleVoice}
                    className={`flex items-center justify-center w-6 h-6 rounded-l-md border transition-all cursor-pointer shrink-0 ${
                      isVoiceActive
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                    }`}
                    title={isVoiceActive ? 'Stop Voice Input' : 'Voice Input'}
                  >
                    <Mic size={11} className={isVoiceActive ? 'animate-pulse text-emerald-500 dark:text-emerald-400' : 'text-muted-foreground'} />
                  </motion.button>
                  <motion.button
                    variants={tagItemVariants}
                    whileHover={{ y: -1.5, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowVoiceMenu((prev) => !prev)}
                    className={`flex items-center justify-center w-4 h-6 rounded-r-md border-y border-r transition-all cursor-pointer shrink-0 ${
                      isVoiceActive
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                    }`}
                    title="Choose Voice Engine"
                  >
                    <ChevronDown size={8} />
                  </motion.button>

                  <AnimatePresence>
                    {showVoiceMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowVoiceMenu(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-full mb-2 right-0 w-48 bg-popover border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-50 p-1 flex flex-col gap-0.5"
                        >
                          <div className="px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 mb-1">
                            Voice Engine
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceEngine('browser');
                              setShowVoiceMenu(false);
                              toast.info('Switched to Browser Speech API');
                            }}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[10px] text-left transition-colors ${
                              voiceEngine === 'browser'
                                ? 'bg-accent/10 text-foreground font-semibold'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            }`}
                          >
                            <span>Browser Speech API (Native)</span>
                            {voiceEngine === 'browser' && <Check size={10} className="text-accent" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceEngine('vad');
                              setShowVoiceMenu(false);
                              toast.info('Switched to Local VAD');
                            }}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[10px] text-left transition-colors ${
                              voiceEngine === 'vad'
                                ? 'bg-accent/10 text-foreground font-semibold'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            }`}
                          >
                            <span>Local VAD (Model-based)</span>
                            {voiceEngine === 'vad' && <Check size={10} className="text-accent" />}
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {isLocalModel && (
                  <motion.button
                    variants={tagItemVariants}
                    whileHover={{ y: -1.5, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => {
                      setShowSettings((v) => !v);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[9.5px] font-bold transition-all cursor-pointer ${
                      showSettings
                        ? 'bg-accent/10 text-accent border border-accent/30'
                        : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <SlidersHorizontal size={10} />
                    <span>Configure</span>
                  </motion.button>
                )}
              </div>
            </motion.div>

            <div
              className={`w-full bg-background border rounded-md px-3 py-2 mt-2 flex flex-col gap-1 relative transition-all duration-300 border-border ${
                isFocused ? 'border-accent/40 ring-1 ring-accent/30' : ''
              }`}
            >
              {selectedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 py-1 border-b border-border/40 pb-2 mb-1">
                  {selectedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group/img flex items-center gap-2 p-2 bg-muted border border-border rounded-md pr-6"
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.data}`}
                        alt={img.name}
                        className="w-8 h-8 rounded-md object-cover bg-background"
                      />
                      <div className="flex flex-col min-w-0 max-w-[120px]">
                        <span className="text-[9px] font-semibold text-foreground truncate">
                          {img.name}
                        </span>
                        <span className="text-[7px] text-muted-foreground uppercase">
                          {img.mimeType.split('/')[1]}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-all"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Voice indicator animation if listening */}
              {isVoiceActive && (
                <div className="absolute top-2 right-2 flex items-center gap-[2px] h-3 z-10 select-none pointer-events-none bg-background/80 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" />
                  <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-wider font-mono">REC</span>
                  <div className="flex items-center gap-[1px] h-1.5 ml-1">
                    <span className="w-[1px] h-full bg-emerald-500 rounded-md animate-[bounce_0.5s_infinite_100ms]" />
                    <span className="w-[1px] h-full bg-emerald-500 rounded-md animate-[bounce_0.5s_infinite_200ms]" />
                    <span className="w-[1px] h-full bg-emerald-500 rounded-md animate-[bounce_0.5s_infinite_300ms]" />
                  </div>
                </div>
              )}

              {/* Submit / Stop button - absolute bottom right */}
              <div className="absolute bottom-2 right-2 z-10 select-none">
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
                    className="h-7 px-3 rounded-md bg-red-500/10 text-red-500 flex items-center justify-center gap-1 border border-red-500/20 text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer"
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
                    className={`h-7 w-7 rounded-md flex items-center justify-center transition-all border cursor-pointer ${
                      canSubmit
                        ? 'bg-accent text-accent-foreground border-accent font-bold'
                        : 'bg-muted border-transparent text-muted-foreground/30 cursor-not-allowed'
                    }`}
                  >
                    <Send size={11} strokeWidth={2.5} />
                  </motion.button>
                )}
              </div>



              <div className="flex items-start gap-1.5 px-1 pr-10">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onChange={(e) => {
                    onPromptChange(e.target.value);
                    adjustHeight();
                    setTemplateSelectedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1 px-1 resize-none min-h-[36px] max-h-[150px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/40 focus:outline-none"
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
