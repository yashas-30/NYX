// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatPromptInput.tsx
 * @description Prompt pill with inference settings panel, tailored specifically for the Chat Agent.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PaperPlaneRight as Send, X, Lightning as Zap, Info, CaretDown as ChevronDown, Microphone as Mic, FadersHorizontal as SlidersHorizontal, Stack as Layers, Check, StopCircle, Robot as Bot, Memory as MemoryStick, Cpu, Thermometer, ArrowCounterClockwise as RotateCcw, Image as ImageIcon } from '@phosphor-icons/react';

import { ModelDefinition } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { analyzePrompt, optimizePromptText } from '@nyx/shared';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { PromptTemplateManager } from './PromptTemplateManager';
import { SectionLabel, ParamSlider, ToolButton } from '@shared/components/PromptInputSubcomponents';
import { LocalModelSettingsPanel } from '@shared/components/LocalModelSettingsPanel';
import { initVoiceMode } from '@src/features/voice/vad';
import { VoiceOverlay } from '@src/features/voice/VoiceOverlay';
import { SpeechToTextHelper } from '@src/features/voice/speechToText';
import { MicVAD } from '@ricky0123/vad-web';
import { useNyxStore } from '@src/shared/store/useNyxStore';


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
  const [showSettings, setShowSettings] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isSubmitting = useRef(false);
  const localSettings = modelSettings;
  const agentLoopEnabled = useNyxStore((state) => state.agentLoopEnabled);
  const setAgentLoopEnabled = useNyxStore((state) => state.setAgentLoopEnabled);

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

  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'processing' | 'transcribing' | 'error'>('listening');
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
    (key: string, value: any) => {
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
      ? 'text-muted-foreground'
      : localSettings.gpuLayers < 50
        ? 'text-primary/70'
        : 'text-primary';

  return (
    <div className="shrink-0 w-full flex flex-col items-center pb-4 pt-2 z-30 gap-2 px-0 md:px-24">
      <div
        className={`relative w-full transition-all duration-500 ease-out max-w-3xl px-4 md:px-0`}
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
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full"
        >
          {visibleTemplates.length > 0 && prompt.startsWith('/') && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 w-full max-h-60 overflow-y-auto bg-surface-container-high border border-outline-variant rounded-md shadow-sm z-50 flex flex-col p-2 custom-scrollbar">
              <div className="px-3 py-2 border-b border-outline-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant text-[14px]">layers</span>
                <span className="text-xs font-bold text-on-surface">Prompt Templates</span>
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
                        ? 'bg-secondary-container text-on-secondary-container font-medium'
                        : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="font-body-sm font-semibold">{t.name}</span>
                    <span className="font-label-mono text-[11px] opacity-70 line-clamp-1">{t.content}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`relative w-full bg-surface/70 backdrop-blur-2xl rounded-[32px] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)] border flex flex-col pt-1 transition-all duration-300 group ${isFocused ? 'border-primary/50 shadow-[0_16px_48px_-12px_rgba(var(--primary-rgb),0.15)] ring-4 ring-primary/10' : 'border-outline-variant/50 hover:border-outline-variant hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.15)] ring-4 ring-transparent'}`}>
            {/* Attachment Area (if files exist) */}
            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-outline-variant/50">
                {selectedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group/img flex items-center gap-2 p-2 bg-surface-variant border border-outline-variant rounded-md pr-6"
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt={img.name}
                      className="w-8 h-8 rounded-md object-cover bg-surface-container-lowest"
                    />
                    <div className="flex flex-col min-w-0 max-w-[120px]">
                      <span className="font-body-sm text-[11px] font-semibold text-on-surface truncate">
                        {img.name}
                      </span>
                      <span className="font-label-mono text-[9px] text-on-surface-variant uppercase">
                        {img.mimeType.split('/')[1]}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input Area */}
            <div className="flex items-end gap-sm px-4 py-2 pb-3">
              <button 
                type="button"
                onClick={handleImageUploadClick}
                disabled={isUploadingImage}
                className={`text-on-surface-variant hover:text-primary transition-colors p-1 ${isUploadingImage ? 'opacity-50' : ''}`} 
                title="Attach files"
              >
                <span className="material-symbols-outlined text-[24px]">add_circle</span>
              </button>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
              />

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
                className="flex-1 bg-transparent border-none text-on-surface font-body-lg resize-none min-h-[28px] max-h-[150px] outline-none placeholder:text-on-surface-variant/50 custom-scrollbar leading-relaxed pt-0.5" 
                placeholder="Message NYX..." 
                rows={1} 
                style={{ height: '28px' }}
              />

              <div className="flex items-center gap-2 pb-0.5">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="h-8 px-3 rounded-full bg-error-container text-on-error-container flex items-center justify-center gap-1 font-body-sm font-semibold transition-all hover:bg-error hover:text-on-error"
                  >
                    <span className="material-symbols-outlined text-[16px] animate-pulse">stop_circle</span>
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors shadow-sm active-scale ${
                      canSubmit
                        ? 'bg-primary text-on-primary hover:bg-primary/90 cursor-pointer'
                        : 'bg-surface-variant/50 text-on-surface-variant/30 cursor-not-allowed'
                    }`}
                    title="Send message"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                  </button>
                )}
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-outline-variant/30 bg-transparent rounded-b-[32px]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors font-body-sm font-medium active-scale ${
                    isVoiceActive ? 'bg-primary text-on-primary' : 'bg-surface-variant/50 text-on-surface hover:bg-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">mic</span>
                  <span>{isVoiceActive ? 'Listening...' : 'Voice'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAgentLoopEnabled(!agentLoopEnabled)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors font-body-sm font-medium active-scale ${
                    agentLoopEnabled ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-variant/50 text-on-surface hover:bg-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">robot</span>
                  <span>Agent Loop</span>
                </button>

                {isLocalModel && (
                  <button
                    type="button"
                    onClick={() => setShowSettings((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors font-body-sm font-medium active-scale ${
                      showSettings ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant/30 bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">tune</span>
                    <span>Configure</span>
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    onPromptChange('');
                    toast.success('Context reset');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant/30 bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant/50 transition-colors font-body-sm font-medium active-scale"
                >
                  <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                  <span>Reset</span>
                </button>
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
