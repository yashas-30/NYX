/**
 * @file src/features/coder/components/PromptInput.tsx
 * @description The input form with model selector, settings popover, file attachment, and toolbar.
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Settings as SettingsIcon, Check, StopCircle,
  Paperclip, ArrowRight, X, Zap, Info, ChevronDown, Bot
} from 'lucide-react';
import { ModelSelector } from '@/src/components/model-card/ModelSelector';
import { ModelDefinition } from '@/src/core/types';
import { toast } from 'sonner';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isLoading: boolean;
  onStop: () => void;
  currentModelId: string | null;
  currentModel: ModelDefinition | null;
  allModels: any[];
  ollamaModels: any[];
  lmStudioModels: any[];
  providerStatuses: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl: string;
  lmStudioBaseUrl: string;
  gatewayUrls: Record<string, string>;
  localModelsEnabled: boolean;
  onSetLocalModelsEnabled: (enabled: boolean) => void;
  onModelSelect: (id: string) => void;
  onClearHistory: () => void;
  onModelSettingsChange: (settings: any) => void;
  modelSettings: any;
  suggestedPrompts: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
  getCustomModelIcon: (model: ModelDefinition | null | undefined) => React.ReactNode;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading,
  onStop,
  currentModelId,
  currentModel,
  allModels,
  ollamaModels,
  lmStudioModels,
  providerStatuses,
  ollamaBaseUrl,
  lmStudioBaseUrl,
  gatewayUrls,
  localModelsEnabled,
  onSetLocalModelsEnabled,
  onModelSelect,
  onClearHistory,
  onModelSettingsChange,
  modelSettings,
  suggestedPrompts,
  onSuggestedPromptClick,
  getCustomModelIcon
}) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast.success(`Attached file: ${file.name}`);
    }
  };

  const adjustHeight = (reset?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (reset) {
      textarea.style.height = '36px';
      return;
    }
    textarea.style.height = '36px';
    const newHeight = Math.max(36, Math.min(textarea.scrollHeight, 300));
    textarea.style.height = `${newHeight}px`;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading) return;
    if (!currentModelId) {
      toast.error('Please select a model first');
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSubmit(e);
    adjustHeight(true);
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className="shrink-0 w-full p-4 bg-white/10 dark:bg-black/10 border-t border-white/10 dark:border-white/5 z-30 backdrop-blur-sm">
      <div className={`mx-auto transition-all duration-700 ease-in-out ${prompt.trim().length > 0 ? 'max-w-2xl' : 'max-w-lg'}`}>
        <AnimatePresence>
          {suggestedPrompts.length > 0 && !isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 5 }} 
              className="flex flex-wrap gap-1.5 px-1 mb-2.5"
            >
              {suggestedPrompts.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onPromptChange(s);
                    textareaRef.current?.focus();
                    onSuggestedPromptClick?.(s);
                  }}
                  className="px-2.5 py-1 rounded-full bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/5 hover:border-primary/40 text-[9px] font-bold text-foreground/60 transition-all cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="relative group">
          <AnimatePresence>
            {showModelSelector && (
              <ModelSelector
                currentModelId={currentModelId}
                allModels={allModels}
                ollamaModels={ollamaModels}
                lmStudioModels={lmStudioModels}
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
                ollamaBaseUrl={ollamaBaseUrl}
                lmStudioBaseUrl={lmStudioBaseUrl}
                isCoder={true}
                onResetContext={() => {
                  onClearHistory();
                  toast.success('Context reset successful');
                }}
                gatewayUrls={gatewayUrls}
                localModelsEnabled={localModelsEnabled}
                setLocalModelsEnabled={onSetLocalModelsEnabled}
                dropdown={true}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showSettings && (
              <>
                <div className="fixed inset-0 z-[499] bg-transparent" onClick={() => setShowSettings(false)} />
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute bottom-full left-0 mb-3 z-[500] w-72 bg-white/95 dark:bg-zinc-900/95 border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl p-5 space-y-4 text-left backdrop-blur-3xl"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parameters</span>
                    <button type="button" onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><Check size={14} strokeWidth={1.5} /></button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[8px] font-bold uppercase text-muted-foreground">
                        <span>Temperature</span>
                        <span>{modelSettings.temperature}</span>
                      </div>
                      <input 
                        type="range" min="0" max="1" step="0.1" 
                        value={modelSettings.temperature}
                        onChange={(e) => onModelSettingsChange({ ...modelSettings, temperature: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[8px] font-bold uppercase text-muted-foreground">
                        <span>Max Tokens</span>
                        <span>{modelSettings.maxTokens}</span>
                      </div>
                      <input 
                        type="range" min="256" max="16384" step="256" 
                        value={modelSettings.maxTokens}
                        onChange={(e) => onModelSettingsChange({ ...modelSettings, maxTokens: parseInt(e.target.value) })}
                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-border-strong/40">
                    <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground font-medium">
                      <Info className="w-2.5 h-2.5" />
                      <span>Settings apply to next command</span>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange} 
            accept="*/*"
          />

          <div className={`flex flex-col gap-1.5 p-1.5 bg-white/35 dark:bg-zinc-900/80 backdrop-blur-xl border rounded-2xl transition-all duration-500 shadow-lg border-white/30 dark:border-white/15 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/10`}>
            <AnimatePresence>
              {selectedFile && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-white/10 dark:border-white/5 rounded-xl self-start max-w-full"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-[8px] text-muted-foreground/50 shrink-0">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 relative flex items-start">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  onPromptChange(e.target.value);
                  adjustHeight();
                }}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    e.currentTarget.blur(); 
                    handleSubmit(); 
                  } 
                }}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-xs py-1 px-1.5 resize-none min-h-[32px] max-h-[220px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/45 scrollbar-none text-left"
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/5 dark:border-white/5 pt-1 px-1">
              <div className="flex items-center gap-1">
                <button 
                  type="button"
                  onClick={() => {
                    setShowModelSelector(true);
                    setShowSettings(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-foreground/80 transition-all select-none hover:bg-white/30 dark:hover:bg-zinc-800/70"
                >
                  {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-3.5 h-3.5 text-muted-foreground/70" />}
                  <span className="truncate max-w-[100px]">{currentModel?.name || 'Select Model'}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                </button>

                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-zinc-800/70 text-muted-foreground hover:text-foreground transition-all"
                  title="Attach File"
                >
                  <Paperclip size={12} strokeWidth={1.5} />
                </button>

                <button 
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-zinc-800/70 text-muted-foreground hover:text-foreground transition-all group ${showSettings ? 'ring-1 ring-primary/40 text-primary bg-white/30 dark:bg-zinc-800/70' : ''}`}
                  title="Model Parameters"
                >
                  <SettingsIcon size={12} strokeWidth={1.5} className="group-hover:rotate-45 transition-transform duration-300" />
                </button>

                <button 
                  type="button" 
                  onClick={onClearHistory} 
                  className="p-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-zinc-800/70 text-muted-foreground/60 hover:text-destructive transition-all group"
                  title="Clear session history"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-105 transition-transform">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {isLoading ? (
                  <button 
                    type="button" 
                    onClick={onStop} 
                    className="h-6 px-2 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center gap-0.5 border border-destructive/20 text-[9px] font-bold tracking-wider uppercase hover:bg-destructive/20 transition-all"
                  >
                    <StopCircle className="w-3 h-3 animate-spin" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    disabled={!prompt.trim() || !currentModelId} 
                    className={`h-6 px-2.5 rounded-lg flex items-center justify-center gap-1 transition-all text-[9px] font-black tracking-widest uppercase ${
                      prompt.trim() && currentModelId
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-100 hover:scale-[1.02]' 
                        : 'bg-muted/20 text-muted-foreground/30 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span>Run</span>
                    <ArrowRight size={10} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
