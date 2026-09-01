// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatPromptInput.tsx
 * @description Prompt pill with inference settings panel, tailored specifically for the Chat Agent.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SendIcon as Send,
  XIcon as X,
  ZapIcon as Zap,
  InfoIcon as Info,
  ChevronDownIcon as ChevronDown,
  MicIcon as Mic,
  SlidersHorizontalIcon as SlidersHorizontal,
  LayersIcon as Layers,
  CheckIcon as Check,
} from '@animateicons/react/lucide';
import {
  StopCircle,
  Bot,
  MemoryStick,
  Cpu,
  Thermometer,
  RotateCcw,
  Image as ImageIcon,
  Globe,
  Brain,
} from 'lucide-react';

import { ModelDefinition } from '@src/infrastructure/types';
import { getModelCapabilities } from '@src/infrastructure/utils/provider';
import { toast } from '@src/shared/components/ui/sonner';

import { PromptTemplateManager } from './PromptTemplateManager';
import { SectionLabel, ParamSlider, ToolButton } from '@shared/components/PromptInputSubcomponents';
import { initVoiceMode } from '@src/features/voice/vad';
import { VoiceOverlay } from '@src/features/voice/VoiceOverlay';
import { SpeechToTextHelper } from '@src/features/voice/speechToText';
import { MicVAD } from '@ricky0123/vad-web';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useModelStore } from '@src/core/stores/useModelStore';
import { useAppStore } from '@src/stores/useAppStore';

interface ChatPromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (
    finalPrompt: string,
    images?: { name: string; mimeType: string; data: string }[]
  ) => boolean | Promise<boolean>;
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
  onAttachFiles: (files: File[]) => void;
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
  hidden: { opacity: 0, x: -10, scale: 0.98 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' as const },
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
  onAttachFiles,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const isSubmitting = useRef(false);
  const localSettings = modelSettings;
  const cloudModelId = useNyxStore((state) => state.cloudModelId);
  const localModelId = useNyxStore((state) => state.localModelId);
  const webSearchEnabled = useAppStore((state) => state.webSearchEnabled);
  const toggleWebSearch = useAppStore((state) => state.toggleWebSearch);

  const hasModelSelected = !!cloudModelId || !!localModelId || !!currentModelId;

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState<'browser' | 'vad'>('browser');
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const vadRef = useRef<MicVAD | null>(null);
  const sttRef = useRef<SpeechToTextHelper | null>(null);
  const basePromptRef = useRef('');

  useEffect(() => {
    return () => {
      if (vadRef.current) vadRef.current.pause();
      if (sttRef.current) sttRef.current.stop();
    };
  }, []);

  const [voiceStatus, setVoiceStatus] = useState<
    'listening' | 'processing' | 'transcribing' | 'error'
  >('listening');
  const [voiceError, setVoiceError] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');

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
        setVoiceStatus('listening');
        setVoiceError('');
        setVoiceTranscript('');

        try {
          const myvad = await initVoiceMode(
            // onSpeechStart
            () => {
              setVoiceStatus('listening');
            },
            // onSpeechEnd
            (text: string) => {
              setVoiceStatus('transcribing');
              if (text.trim()) {
                setVoiceTranscript(text);
                onPromptChange(basePromptRef.current + (basePromptRef.current ? ' ' : '') + text);
                toast.success('Speech transcribed successfully');
              }
              // Wait 1.5s then automatically close
              setTimeout(() => {
                setIsVoiceActive(false);
                if (vadRef.current) {
                  vadRef.current.pause();
                  vadRef.current = null;
                }
              }, 1500);
            },
            // onMisfire
            () => {
              toast.info('VAD misfire (no clear speech detected)');
            },
            // onError
            (err: string) => {
              setVoiceStatus('error');
              setVoiceError(err);
              toast.error(err);
              setIsVoiceActive(false);
            }
          );
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
            },
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
      // Delegate to the shared file handler which handles both images and documents
      onAttachFiles(Array.from(files));
    } catch (error: any) {
      toast.error(`File attach failed: ${error.message}`);
    } finally {
      setIsUploadingImage(false);
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
  // Also check localModelId directly — a local model might not yet be in
  // mergedModels (store still loading), but localModelId is always set.
  const localModelId_store = useNyxStore((state) => state.localModelId);
  const isLocalModel = !!(
    currentModelId &&
    (providerStr === 'nyx-native' ||
      (!currentModel && currentModelId) ||
      localModelId_store === currentModelId)
  );

  // Look up the active local model's capabilities from useModelStore directly.
  // This is the most reliable source: it reads from the Rust backend via
  // loadLocalLibraryModels() and isn't subject to the prop chain being stale.
  const localLibraryModels = useModelStore((s) => s.localLibraryModels);
  const localModelDef = localLibraryModels.find((m) => m.id === currentModelId);

  // ── Context window max ────────────────────────────────────────────────────
  let maxContext = 8192;
  if (localModelDef?.specs?.contextWindow) {
    const val = String(localModelDef.specs.contextWindow).toUpperCase();
    const cleanVal = val.replace(/\(.*?\)/g, '').trim();

    if (cleanVal.includes('B')) {
      maxContext = parseInt(cleanVal.replace('B', '').trim()) * 1024 * 1024 * 1024;
    } else if (cleanVal.includes('M')) {
      maxContext = parseInt(cleanVal.replace('M', '').trim()) * 1024 * 1024;
    } else if (cleanVal.includes('K')) {
      maxContext = parseInt(cleanVal.replace('K', '').trim()) * 1024;
    } else {
      maxContext = parseInt(cleanVal.trim()) || 8192;
    }
  }

  // If the saved context exceeds this model's max, auto-correct to the model's max.
  const storedCtx = localSettings.contextSize ?? 8192;
  const effectiveCtx = storedCtx > maxContext ? maxContext : storedCtx;

  // Auto-save the corrected value so the next model load uses the right context.
  useEffect(() => {
    if (storedCtx > maxContext && currentModelId) {
      updateLocal('contextSize', maxContext);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModelId, maxContext]);

  const capabilities = getModelCapabilities(currentModelId || '');
  // Priority: 1) useModelStore metadata  2) currentModel prop metadata  3) string heuristic
  const supportsVision = localModelDef
    ? !!localModelDef.capabilities?.vision
    : currentModel != null && 'capabilities' in currentModel
      ? !!(currentModel as any).capabilities?.vision
      : capabilities.supportsVision;
  const supportsReasoning = localModelDef
    ? !!localModelDef.capabilities?.reasoning
    : currentModel != null && 'capabilities' in currentModel
      ? !!(currentModel as any).capabilities?.reasoning
      : capabilities.supportsReasoning;
  const canAttachFiles = supportsVision;
  const [showReasoningMenu, setShowReasoningMenu] = useState(false);

  const loadLocalLibraryModels = useModelStore((s) => s.loadLocalLibraryModels);

  // Eagerly load local model metadata if a local model is active but the
  // store list is empty (e.g. ModelSelector hasn't mounted yet this session).
  useEffect(() => {
    if (isLocalModel && localLibraryModels.length === 0) {
      loadLocalLibraryModels();
    }
  }, [isLocalModel, localLibraryModels.length, loadLocalLibraryModels]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    (key: string, value: any) => {
      onModelSettingsChange({ ...modelSettings, [key]: value });
    },
    [modelSettings, onModelSettingsChange]
  );

  const resetLocalSettings = useCallback(() => {
    onModelSettingsChange({
      ...modelSettings,
      // 0 = auto � let the SmartNglScheduler decide from live VRAM measurement.\r\n      gpuLayers: undefined,\r\n      // 0 = auto � backend uses 8192 by default, auto-reduced for VRAM if needed.\r\n      contextSize: 0,\r\n      // 0 = auto � scheduler picks optimal ubatch size from VRAM headroom.\r\n      batchSize: 0,\r\n      // 0 = auto � scheduler picks physical CPU core count.\r\n      threads: 0,\r\n      temperature: 0.7,\r\n      topP: 0.95,\r\n      topK: 40,\r\n      flashAttention: true,\r\n      // auto = backend selects q8_0, q5_0, or q4_0 by VRAM headroom.\r\n      kvCacheType: 'auto',\r\n      useMlock: false,\r\n      disableKvOffload: false,
    });
    toast.success('Settings reset to smart auto-defaults');
  }, [modelSettings, onModelSettingsChange]);

  const adjustHeight = (reset?: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (reset) {
      ta.style.height = '32px';
      return;
    }
    ta.style.height = '32px';
    ta.style.height = `${Math.max(32, Math.min(ta.scrollHeight, 150))}px`;
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
    if (!hasModelSelected) {
      toast.error('Please select a model first');
      return;
    }

    isSubmitting.current = true;

    // Capture the current prompt and images before clearing them optimistically
    const submittedPrompt = prompt;
    const submittedImages = selectedImages;

    // Optimistically clear the input UI instantly from the component's side
    onPromptChange('');
    updateImages([]);
    adjustHeight(true);

    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

      // Pass the captured values to the submit handler
      await onSubmit(submittedPrompt, submittedImages);

      // Note: We no longer clear the prompt here at the end.
      // If we did, and the user started typing a new prompt during generation, it would be wiped out.
      // The parent component (ChatPage) handles restoring the prompt if generation fails.
    } finally {
      setTimeout(() => {
        isSubmitting.current = false;
      }, 500);
    }
  };

  const canSubmit =
    (!!prompt.trim() || selectedImages.length > 0) && hasModelSelected && !isLoading;

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
      ? 'text-muted-foreground'
      : localSettings.gpuLayers < 50
        ? 'text-primary/70'
        : 'text-primary';

  return (
    <div className="shrink-0 w-full flex flex-col items-center pb-3 pt-1.5 bg-background z-30 gap-2 px-3 md:px-4">
      <div className="relative w-full max-w-2xl mx-auto transition-all duration-500 ease-out">
        {/* ── Chat Prompt Capsule ─────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          layout
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full"
        >
          {visibleTemplates.length > 0 && prompt.startsWith('/') && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 w-full max-h-60 overflow-y-auto bg-popover/90 backdrop-blur-xl border border-border rounded-md shadow-sm z-50 flex flex-col p-2 scrollbar-none">
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

          <div className="w-full flex flex-col bg-card border border-border focus-within:border-border-strong rounded-xl p-1 transition-colors duration-200">
            <motion.div
              variants={tagContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex items-center justify-between px-1.5 py-0.5 border-b border-border/30 overflow-visible select-none h-6 gap-1.5"
            >
              <div className="flex items-center gap-1">
                <motion.button
                  variants={tagItemVariants}
                  whileHover={canAttachFiles ? { y: -1, scale: 1.02 } : {}}
                  whileTap={canAttachFiles ? { scale: 0.98 } : {}}
                  type="button"
                  onClick={handleImageUploadClick}
                  disabled={isUploadingImage || !canAttachFiles}
                  className={`flex items-center gap-1 h-5 px-2 rounded transition-all text-left shrink-0 ${
                    !canAttachFiles
                      ? 'bg-muted/50 border border-border/30 text-muted-foreground/40 cursor-not-allowed opacity-50'
                      : 'bg-secondary border border-border hover:border-border-strong hover:text-foreground text-muted-foreground cursor-pointer'
                  }`}
                  title={
                    !canAttachFiles
                      ? 'Selected model does not support vision/image input'
                      : 'Attach image'
                  }
                  aria-label="Attach image"
                >
                  <ImageIcon className="w-3 h-3 opacity-70" />
                  <span className="text-[9px] font-semibold tracking-tight">
                    {isUploadingImage ? 'Uploading...' : 'Attach Image'}
                  </span>
                </motion.button>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  className="hidden"
                  disabled={!canAttachFiles}
                />
                <motion.button
                  variants={tagItemVariants}
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={toggleWebSearch}
                  className={`flex items-center gap-1 h-5 px-2 rounded border transition-all text-left cursor-pointer shrink-0 ${
                    webSearchEnabled
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-secondary border-border hover:border-border-strong hover:text-foreground text-muted-foreground'
                  }`}
                  aria-label="Toggle web search"
                >
                  <Globe className="w-3 h-3" />
                  <span className="text-[9px] font-semibold tracking-tight">Web Search</span>
                </motion.button>

                <div className="flex items-center">
                  <PromptTemplateManager
                    onSelectTemplate={(content) => {
                      onPromptChange(content);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  />
                </div>

                {/* Divider */}
                <div className="w-px h-3 bg-border/40 mx-0.5" />
              </div>

              <div className="flex items-center gap-1.5">
                {/* Voice Input Tag with Dropdown */}
                <div className="relative flex items-center shrink-0">
                  <motion.button
                    variants={tagItemVariants}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={toggleVoice}
                    className={`flex items-center justify-center w-5 h-5 rounded-l border transition-all cursor-pointer shrink-0 hover:scale-105 ${
                      isVoiceActive
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'bg-secondary border-border text-muted-foreground hover:text-emerald-500 hover:border-emerald-500/40'
                    }`}
                    title={isVoiceActive ? 'Stop Voice Input' : 'Voice Input'}
                  >
                    <Mic
                      size={10}
                      className={
                        isVoiceActive
                          ? 'animate-pulse text-emerald-500 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      }
                    />
                  </motion.button>
                  <motion.button
                    variants={tagItemVariants}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowVoiceMenu((prev) => !prev)}
                    className={`flex items-center justify-center w-3.5 h-5 rounded-r border-y border-r transition-all cursor-pointer shrink-0 hover:scale-105 ${
                      isVoiceActive
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                        : 'bg-secondary border-border text-muted-foreground hover:text-emerald-500 hover:border-emerald-500/40'
                    }`}
                    title="Choose Voice Engine"
                  >
                    <ChevronDown size={7} />
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
                            {voiceEngine === 'browser' && (
                              <Check size={10} className="text-accent" />
                            )}
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
              </div>
            </motion.div>

            <div
              className={`w-full bg-background border rounded-lg px-2.5 py-1.5 mt-1 flex flex-col gap-1 relative transition-all duration-300 border-border ${
                isFocused ? 'border-accent/40 ring-1 ring-accent/25' : ''
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
                  <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-wider font-mono">
                    REC
                  </span>
                  <div className="flex items-center gap-[1px] h-1.5 ml-1">
                    <span className="w-[1px] h-full bg-emerald-500 rounded-md animate-[bounce_0.5s_infinite_100ms]" />
                    <span className="w-[1px] h-full bg-emerald-500 rounded-md animate-[bounce_0.5s_infinite_200ms]" />
                    <span className="w-[1px] h-full bg-emerald-500 rounded-md animate-[bounce_0.5s_infinite_300ms]" />
                  </div>
                </div>
              )}

              {/* Submit / Stop button - absolute bottom right */}
              <div className="absolute bottom-1.5 right-1.5 z-10 select-none">
                {isLoading ? (
                  <motion.button
                    whileHover={{
                      scale: 1.02,
                    }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={onStop}
                    aria-label="Stop generating"
                    className="h-7 px-2.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center gap-1 border border-destructive/20 text-[9px] font-bold tracking-wider uppercase transition-colors cursor-pointer"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Stop
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{
                      scale: canSubmit ? 1.04 : 1,
                    }}
                    whileTap={{ scale: canSubmit ? 0.96 : 1 }}
                    type="submit"
                    disabled={!canSubmit}
                    aria-label="Send message"
                    className={`h-8 w-8 min-h-[32px] min-w-[32px] sm:h-7 sm:w-7 rounded flex items-center justify-center transition-colors border cursor-pointer ${
                      canSubmit
                        ? 'bg-primary text-primary-foreground border-primary font-bold'
                        : 'bg-muted border-transparent text-muted-foreground/30 cursor-not-allowed'
                    }`}
                  >
                    <Send size={12} />
                  </motion.button>
                )}
              </div>

              <div className="flex items-start gap-1.5 px-0.5 pr-9">
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
                  placeholder="Message NYX..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-0.5 px-1 resize-none min-h-[32px] max-h-[150px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/40 focus:outline-none"
                  style={{ scrollbarWidth: 'none' }}
                />
              </div>
            </div>
          </div>
        </motion.form>
      </div>

      {/* Voice Activity Detection Overlay */}
      <VoiceOverlay
        isOpen={isVoiceActive && voiceEngine === 'vad'}
        onClose={() => {
          setIsVoiceActive(false);
          if (vadRef.current) {
            vadRef.current.pause();
            vadRef.current = null;
          }
        }}
        status={voiceStatus}
        errorMessage={voiceError}
        transcript={voiceTranscript}
      />
    </div>
  );
};
