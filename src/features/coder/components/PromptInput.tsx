/**
 * @file src/features/coder/components/PromptInput.tsx
 * @description Gemini-style centered bottom floating input pill with spring animations,
 *   hardware critique panel, model selector, and action toolbar.
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import {
  Send, Settings as SettingsIcon, Check, StopCircle,
  Paperclip, X, Zap, Info, ChevronDown, Bot, Globe, FolderCode, Plus,
  Mic
} from 'lucide-react';
import { ModelSelector } from '@/src/components/model-card/ModelSelector';
import { ModelDefinition } from '@/src/core/types';
import { toast } from 'sonner';
import { analyzePrompt, optimizePromptText } from '../utils/promptAnalyzer';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (finalPrompt: string) => void;
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
  webSearchEnabled: boolean;
  onWebSearchToggle: (enabled: boolean) => void;
  codebaseKnowledgeEnabled: boolean;
  onCodebaseKnowledgeToggle: (enabled: boolean) => void;
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
  getCustomModelIcon,
  webSearchEnabled,
  onWebSearchToggle,
  codebaseKnowledgeEnabled,
  onCodebaseKnowledgeToggle,
}) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live hardware analysis
  const analysis = prompt ? analyzePrompt(prompt) : null;
  const isHardware = analysis?.hardware?.isHardware || false;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast.success(`Attached: ${file.name}`);
    }
  };

  const adjustHeight = (reset?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (reset) { textarea.style.height = '36px'; return; }
    textarea.style.height = '36px';
    textarea.style.height = `${Math.max(36, Math.min(textarea.scrollHeight, 220))}px`;
  };

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading) return;
    if (!currentModelId) { toast.error('Please select a model first'); return; }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    let finalPrompt = prompt;
    if (selectedFile) {
      try {
        const fileContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(selectedFile);
        });
        finalPrompt = `[ATTACHED FILE: ${selectedFile.name}]\n\`\`\`\n${fileContent}\n\`\`\`\n\n${prompt}`;
        setSelectedFile(null);
        toast.success(`Sent attached file: ${selectedFile.name}`);
      } catch (err) {
        console.error('Failed to read attached file:', err);
        toast.error(`Could not read file ${selectedFile.name}`);
        return;
      }
    }

    onSubmit(finalPrompt);
    adjustHeight(true);
  };

  const canSubmit = !!prompt.trim() && !!currentModelId && !isLoading;

  return (
    /* Outer wrapper: anchored at bottom, centered */
    <div className="shrink-0 w-full flex flex-col items-center px-4 pb-4 pt-2 bg-[#131315] z-30">
      {/* Max-width container that grows with prompt */}
      <div className={`relative w-full transition-all duration-500 ease-out ${prompt.trim().length > 0 ? 'max-w-3xl' : 'max-w-2xl'}`}>

        {/* Hardware critique panel */}
        <AnimatePresence>
          {isHardware && analysis && analysis.hardware && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: 8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              className="mb-3 overflow-hidden rounded-2xl border border-violet-500/15 bg-zinc-900/90 backdrop-blur-xl shadow-2xl"
            >
              <div className="p-4">
                {/* Critique header */}
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-violet-400" />
                      <span className="font-extrabold text-[10px] uppercase tracking-widest bg-gradient-to-r from-violet-400 via-primary to-cyan-400 bg-clip-text text-transparent">
                        NYX Hardware Analyzer
                      </span>
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    type="button"
                    onClick={() => {
                      const opt = optimizePromptText(prompt, analysis);
                      onPromptChange(opt);
                      toast.success('Prompt optimized into engineering specification!');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 text-[9px] font-black uppercase tracking-widest text-violet-300 transition-all"
                  >
                    <Zap className="w-3 h-3 text-amber-400 fill-amber-400 animate-pulse" />
                    Auto-Optimize Spec
                  </motion.button>
                </div>

                <div className="space-y-3 max-h-[200px] overflow-y-auto scrollbar-none pr-1">
                  {/* Platform & component badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.hardware.detectedPlatforms.map((p: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-cyan-500/8 border border-cyan-500/15 text-[8px] font-bold uppercase tracking-wider text-cyan-400">
                        Host: {p}
                      </span>
                    ))}
                    {analysis.hardware.detectedComponents.map((c: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-violet-500/8 border border-violet-500/15 text-[8px] font-bold uppercase tracking-wider text-violet-400">
                        Component: {c}
                      </span>
                    ))}
                    {analysis.hardware.detectedProtocols.map((pr: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-emerald-500/8 border border-emerald-500/15 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                        Protocol: {pr}
                      </span>
                    ))}
                  </div>

                  {/* Alerts */}
                  <div className="space-y-1.5">
                    {analysis.hardware.gaps.map((gap: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] leading-relaxed text-yellow-200/90 bg-yellow-500/4 p-2 rounded-xl border border-yellow-500/10">
                        <span className="text-[11px] shrink-0">⚠</span>
                        <div>
                          <span className="font-extrabold uppercase text-[8px] tracking-wider block text-yellow-500/70 mb-0.5">Gap / Ambiguity</span>
                          {gap}
                        </div>
                      </div>
                    ))}
                    {analysis.hardware.safetyHazards.map((h: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] leading-relaxed text-red-200/90 bg-red-500/4 p-2 rounded-xl border border-red-500/10">
                        <span className="text-[11px] shrink-0">!</span>
                        <div>
                          <span className="font-extrabold uppercase text-[8px] tracking-wider block text-red-400/70 mb-0.5">Safety Warning</span>
                          {h}
                        </div>
                      </div>
                    ))}
                    {analysis.hardware.optimizations.map((o: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] leading-relaxed text-purple-200/90 bg-purple-500/4 p-2 rounded-xl border border-purple-500/10">
                        <span className="text-[11px] shrink-0">*</span>
                        <div>
                          <span className="font-extrabold uppercase text-[8px] tracking-wider block text-purple-400/70 mb-0.5">Optimization</span>
                          {o}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Model Selector dropdown */}
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
              onResetContext={() => { onClearHistory(); toast.success('Context reset'); }}
              gatewayUrls={gatewayUrls}
              localModelsEnabled={localModelsEnabled}
              setLocalModelsEnabled={onSetLocalModelsEnabled}
              dropdown={true}
            />
          )}
        </AnimatePresence>

        {/* Settings popover */}
        <AnimatePresence>
          {showSettings && (
            <>
              <div className="fixed inset-0 z-[499] bg-transparent" onClick={() => setShowSettings(false)} />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="absolute bottom-full mb-3 right-0 z-[500] w-68 bg-zinc-900/95 border border-white/10 rounded-3xl shadow-2xl p-5 space-y-4 backdrop-blur-3xl"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Parameters</span>
                  <button type="button" onClick={() => setShowSettings(false)} className="text-muted-foreground/40 hover:text-foreground"><Check size={14} /></button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[8px] font-bold uppercase text-muted-foreground/50">
                      <span>Temperature</span><span>{modelSettings.temperature}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.1" value={modelSettings.temperature}
                      onChange={(e) => onModelSettingsChange({ ...modelSettings, temperature: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[8px] font-bold uppercase text-muted-foreground/50">
                      <span>Max Tokens</span><span>{modelSettings.maxTokens}</span>
                    </div>
                    <input type="range" min="256" max="16384" step="256" value={modelSettings.maxTokens}
                      onChange={(e) => onModelSettingsChange({ ...modelSettings, maxTokens: parseInt(e.target.value) })}
                      className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-primary" />
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground/40">
                    <Info className="w-2.5 h-2.5" />
                    <span>Settings apply to next message</span>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>



        {/* ── Main pill container ────────────────────────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          layout
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="relative"
        >
          <div className="flex flex-col gap-1.5 p-2 bg-zinc-900/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-2xl shadow-black/40 focus-within:border-white/[0.14] transition-all duration-300">

            {/* File attachment chip */}
            <AnimatePresence>
              {selectedFile && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/4 border border-white/6 rounded-2xl self-start max-w-full mx-1"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    <span className="text-[10px] font-mono text-muted-foreground/70 truncate max-w-[200px]">{selectedFile.name}</span>
                    <span className="text-[8px] text-muted-foreground/30 shrink-0">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button type="button" onClick={() => setSelectedFile(null)} className="p-0.5 rounded-full hover:bg-white/8 text-muted-foreground/40 hover:text-foreground/60 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea row */}
            <div className="flex items-start gap-2 px-1">
              {/* + button (left) */}
              <motion.button
                whileTap={{ scale: 0.85, rotate: 45 }}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 p-1.5 rounded-full text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/5 transition-all shrink-0"
              >
                <Plus size={16} />
              </motion.button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => { onPromptChange(e.target.value); adjustHeight(); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1.5 px-1 resize-none min-h-[36px] max-h-[220px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/30 scrollbar-none"
              />

              {/* Mic button (right) */}
              <button
                type="button"
                className="mt-1 p-1.5 rounded-full text-muted-foreground/30 hover:text-foreground/60 hover:bg-white/5 transition-all shrink-0"
              >
                <Mic size={15} />
              </button>
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between px-1">
              {/* Left tools */}
              <div className="flex items-center gap-0.5">
                {/* Model selector button */}
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowModelSelector(true); setShowSettings(false); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all select-none ${
                    currentModel
                      ? 'text-foreground/70 hover:bg-white/5'
                      : 'text-amber-400 ring-1 ring-amber-400/30 bg-amber-500/5 hover:bg-amber-500/8 font-bold'
                  }`}
                >
                  {currentModel ? getCustomModelIcon(currentModel) : <Bot className="w-3.5 h-3.5 text-amber-400/70" />}
                  <span className="truncate max-w-[120px]">{currentModel?.name || 'Select model'}</span>
                  <ChevronDown className="w-3 h-3 opacity-40" />
                </motion.button>

                <div className="w-px h-4 bg-white/[0.07] mx-1" />

                {/* Web search */}
                <ToolButton
                  active={webSearchEnabled}
                  onClick={() => onWebSearchToggle(!webSearchEnabled)}
                  title="Web Search"
                  icon={<Globe size={13} strokeWidth={1.5} className={webSearchEnabled ? 'animate-pulse' : ''} />}
                  activeColor="text-blue-400 bg-blue-500/8 border-blue-500/15"
                />



                {/* Settings */}
                <ToolButton
                  active={showSettings}
                  onClick={() => setShowSettings(!showSettings)}
                  title="Parameters"
                  icon={<SettingsIcon size={13} strokeWidth={1.5} className={`transition-transform duration-300 ${showSettings ? 'rotate-45' : ''}`} />}
                  activeColor="text-primary bg-primary/8 border-primary/15"
                />
              </div>

              {/* Right: Stop / Submit */}
              <div className="flex items-center gap-1.5">
                {isLoading ? (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    onClick={onStop}
                    className="h-8 px-3 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center gap-1.5 border border-red-500/15 text-[10px] font-bold tracking-wider uppercase hover:bg-red-500/15 transition-all"
                  >
                    <StopCircle className="w-3.5 h-3.5 animate-spin" />
                    Stop
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: canSubmit ? 0.92 : 1 }}
                    type="submit"
                    disabled={!canSubmit}
                    className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all ${
                      canSubmit
                        ? 'bg-white text-zinc-900 shadow-lg hover:bg-white/90'
                        : 'bg-white/5 text-muted-foreground/20 cursor-not-allowed'
                    }`}
                  >
                    <Send size={13} strokeWidth={2} />
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </motion.form>

        {/* Hidden file input */}
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*/*" />
      </div>
    </div>
  );
};

/* ── Shared toolbar button ─────────────────────────────────────────────── */
const ToolButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  activeColor: string;
}> = ({ active, onClick, title, icon, activeColor }) => (
  <motion.button
    whileTap={{ scale: 0.88 }}
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-lg border transition-all ${
      active
        ? `${activeColor} border`
        : 'text-muted-foreground/40 hover:text-foreground/60 hover:bg-white/4 border-transparent'
    }`}
  >
    {icon}
  </motion.button>
);
