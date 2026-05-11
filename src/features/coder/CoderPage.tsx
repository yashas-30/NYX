/**
 * @file src/features/coder/CoderPage.tsx
 * @description The standalone Coder feature page, integrating the local hook and AIService.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FREE_OPENCODE_MODELS } from '@/src/config/models';
import { 
  Send, Sparkles, Terminal as TerminalIcon, 
  Trash2, Copy, Check, StopCircle, 
  History, Info, ChevronDown, 
  Zap, BrainCircuit, MessageSquare, 
  Settings as SettingsIcon, Save, ArrowDown, Bot, Plus
} from 'lucide-react';

// UI Components (Shared)
import { Button } from '@/src/components/ui/button';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { ModelSelector } from '@/src/components/model-card/ModelSelector';

// Feature Logic
import { useCoderLogic } from './hooks/useCoderLogic';

// Core & Config
import { ModelDefinition, Provider } from '@/src/core/types';
import { toast } from 'sonner';
import { ProviderIcon, getProviderLabel } from '@/src/components/ui/ProviderIcon';

interface CoderPageProps {
  // Global App State
  allModels: any[];
  apiKeys: Record<string, string>;
  lmStudioBaseUrl: string;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  
  // Local model status (Ollama/LM Studio)
  ollamaModels: any[];
  lmStudioModels: any[];
  ollamaStatus: string;
  lmStudioStatus: string;
  onRefreshOllama: () => void;
  onRefreshLMStudio: () => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl: string;
}

export const CoderPage: React.FC<CoderPageProps> = ({
  allModels,
  apiKeys,
  lmStudioBaseUrl,
  modelSettings,
  trackUsage,
  ollamaModels,
  lmStudioModels,
  ollamaStatus,
  lmStudioStatus,
  onRefreshOllama,
  onRefreshLMStudio,
  setModelSettings,
  providerStatuses = {},
  ollamaBaseUrl
}) => {
  const {
    activeAgent, setActiveAgent,
    isLoading,
    history,
    metrics,
    models, setModel,
    runCoder, stopCoder, clearHistory,
    agentPersonas, suggestedPrompts
  } = useCoderLogic({
    apiKeys,
    lmStudioBaseUrl,
    modelSettings,
    trackUsage,
    ollamaModels,
    lmStudioModels,
    ollamaBaseUrl
  });

  const [prompt, setPrompt] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentPersona = agentPersonas[activeAgent];
  const currentModelId = models[activeAgent];
  
  const mergedModels = useMemo(() => {
    const localOllama: ModelDefinition[] = (ollamaModels || []).map(m => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as Provider,
      isLocal: true
    }));
    
    const localLMStudio: ModelDefinition[] = (lmStudioModels || []).map(m => ({
      id: m.id || m.name,
      name: m.name,
      provider: 'lmstudio' as Provider,
      isLocal: true
    }));

    const seenIds = new Set();
    return [...allModels, ...localOllama, ...localLMStudio, ...FREE_OPENCODE_MODELS].filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels, ollamaModels, lmStudioModels]);

  const currentModel = useMemo(() => {
    return mergedModels.find(m => m.id === currentModelId) || mergedModels[0];
  }, [currentModelId, mergedModels]);

  const [showSettings, setShowSettings] = useState(false);


  // Sync selected provider when selector opens or model changes
  useEffect(() => {
    if (showModelSelector && currentModel?.provider) {
      setSelectedProvider(currentModel.provider);
    }
  }, [showModelSelector, currentModel]);

  // Auto-scroll logic - use requestAnimationFrame to avoid forced reflow
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      requestAnimationFrame(() => {
        if (consoleRef.current && autoScroll) {
          consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
      });
    }
  }, [history, autoScroll]);

  const handleScroll = () => {
    if (!consoleRef.current) return;
    // Use requestAnimationFrame to avoid forced reflow
    requestAnimationFrame(() => {
      if (!consoleRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
      setShowJumpToBottom(!isAtBottom && history.length > 0);
    });
  };

  const jumpToBottom = () => {
    if (consoleRef.current) {
      requestAnimationFrame(() => {
        if (consoleRef.current) {
          consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
          setAutoScroll(true);
        }
      });
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading) return;
    runCoder(prompt);
    setPrompt('');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Code copied to clipboard');
  };

  const badgeStatus = useMemo(() => {
    const provider = currentModel?.provider;
    if (!provider) return 'offline';
    
    // Normalize provider name for lookup
    const p = provider.toLowerCase();
    const status = providerStatuses[p];
    
    if (status === 'no-key') return 'no_key';
    if (status === 'offline') return 'offline';
    if (status === 'online') return isLoading ? 'loading' : 'success';
    
    // Fallback logic if providerStatuses is empty or missing the provider
    if (p === 'ollama' && ollamaStatus !== 'ok') return 'offline';
    if (p === 'lmstudio' && lmStudioStatus !== 'ok') return 'offline';
    if (['gemini', 'openrouter', 'nvidia'].includes(p) && !apiKeys[p]) return 'no_key';
    
    return isLoading ? 'loading' : 'success';
  }, [currentModel, providerStatuses, ollamaStatus, lmStudioStatus, apiKeys, isLoading]);

  return (
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden">
      {/* ─── Header ─── */}
      <header className="h-11 shrink-0 border-b border-border-strong/30 bg-background/80 backdrop-blur-2xl flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-4">
          <div className="flex bg-muted/30 p-1 rounded-lg border border-border">
            <button 
              onClick={() => setActiveAgent('open')}
              className={`px-4 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                activeAgent === 'open' 
                ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' 
                : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              OpenCode
            </button>
            <button 
              onClick={() => setActiveAgent('claude')}
              className={`px-4 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                activeAgent === 'claude' 
                ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' 
                : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Claude Code
            </button>
          </div>
          <div className="h-5 w-px bg-border-strong mx-1" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold tracking-tight text-foreground">{currentPersona.name}</span>
                <span className="text-[8px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">v{currentPersona.version}</span>
              </div>
            </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/40 px-3 py-1.5 rounded-xl border border-border-strong shadow-inner group">
            <Zap className="w-3 h-3 text-primary group-hover:scale-110 transition-transform" />
            <div className="flex flex-col min-w-[50px]">
              <span className="text-[7px] font-black text-muted-foreground uppercase leading-none">Latency</span>
              <span className="text-[11px] font-mono font-bold leading-none mt-0.5">
                {isLoading && metrics.latency === 0 ? (
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>...</motion.span>
                ) : `${metrics.latency}ms`}
              </span>
            </div>
          </div>

          <StatusBadge status={badgeStatus} />
          
          <button 
            onClick={clearHistory}
            className="p-1.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all border border-transparent hover:border-destructive/20 group"
            title="Clear Session"
          >
            <Trash2 size={13} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </header>

      {/* ─── Terminal Body ─── */}
      <div className="flex-1 min-h-0 relative flex flex-col bg-background/20 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 flex gap-2 p-1 bg-background/40 backdrop-blur-2xl border border-border-strong rounded-xl shadow-2xl">
          <button 
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="flex items-center gap-2.5 px-4 py-1 hover:bg-muted/50 rounded-lg transition-all group"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${badgeStatus === 'success' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]' : 'bg-muted-foreground/30'}`} />
            <span className="text-[11px] font-bold text-foreground/90">{currentModel?.name || 'Select Model'}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-500 ${showModelSelector ? 'rotate-180' : ''}`} />
          </button>
          <div className="w-px h-5 bg-border-strong my-auto mx-0.5" />
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition-all group ${showSettings ? 'bg-primary/20 text-primary' : 'hover:bg-primary/10 text-muted-foreground'}`} 
            title="Model Settings"
          >
            <SettingsIcon size={13} strokeWidth={1.5} className="group-hover:text-primary" />
          </button>
        </div>


        {/* Model Settings Panel Overlay */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-50 w-80 bg-card/95 backdrop-blur-3xl border border-border-strong rounded-3xl shadow-2xl p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Parameters</span>
                <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><Check size={16} strokeWidth={1.5} /></button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                    <span>Temperature</span>
                    <span>{modelSettings.temperature}</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={modelSettings.temperature}
                    onChange={(e) => setModelSettings({ ...modelSettings, temperature: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                    <span>Max Tokens</span>
                    <span>{modelSettings.maxTokens}</span>
                  </div>
                  <input 
                    type="range" min="256" max="16384" step="256" 
                    value={modelSettings.maxTokens}
                    onChange={(e) => setModelSettings({ ...modelSettings, maxTokens: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
              
              <div className="pt-2 border-t border-border-strong">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Info className="w-3 h-3" />
                  <span>Settings apply to next command</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={consoleRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative px-6 py-8 lg:px-10">
          <div className="max-w-3xl mx-auto w-full space-y-6 pb-32">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-125 animate-pulse" />
                  <TerminalIcon className="w-10 h-10 text-primary relative z-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-bold tracking-tight text-foreground">Awaiting Instructions</h2>
                  <p className="text-muted-foreground max-w-sm mx-auto text-[13px] leading-relaxed">
                    Industrial-grade AI guidance for infrastructure and deployment.
                  </p>
                </div>
              </div>
            ) : (
              history.map((msg, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}
                >
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">
                      {msg.role === 'user' ? 'Operator' : 'System'}
                    </span>
                  </div>
                  <div className={`
                    relative max-w-[90%] px-4 py-3 rounded-xl border transition-all duration-500
                    ${msg.role === 'user' 
                      ? 'bg-card border-border-strong text-foreground/90 self-end rounded-tr-none' 
                      : msg.status === 'error'
                        ? 'bg-destructive/5 border-destructive/20 text-destructive self-start rounded-tl-none'
                        : 'bg-card/30 backdrop-blur-xl border-border-strong self-start rounded-tl-none'
                    }
                  `}>
                    {msg.content ? (
                      <>
                        <div className="text-[13.5px] leading-[1.7] font-medium tracking-normal whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        {msg.role === 'assistant' && msg.metrics && (
                          <div className="mt-4 pt-3 border-t border-border-strong/20 flex items-center justify-end gap-3 opacity-40 hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1.2">
                              <Zap className="w-2 h-2 text-primary" />
                              <span className="text-[9px] font-mono font-bold tracking-wider uppercase">
                                {msg.metrics.tps} <span className="text-[7px] opacity-40">t/s</span>
                              </span>
                            </div>
                            <div className="w-px h-1.5 bg-border-strong/50" />
                            <div className="flex items-center gap-1.2">
                              <BrainCircuit className="w-2 h-2 text-primary" />
                              <span className="text-[9px] font-mono font-bold tracking-wider uppercase">
                                {msg.metrics.tokens} <span className="text-[7px] opacity-40">units</span>
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col gap-2 py-1">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 self-start animate-pulse">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary">Executing...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Jump to Bottom */}
        <AnimatePresence>
          {showJumpToBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 15 }}
              onClick={jumpToBottom}
              className="absolute bottom-32 right-10 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-2xl font-black uppercase tracking-widest text-[9px]"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Jump to Latest
            </motion.button>
          )}
        </AnimatePresence>

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
                setModel(id);
                setShowModelSelector(false);
                setModelSearch('');
              }}
              onClose={() => setShowModelSelector(false)}
              providerStatuses={providerStatuses}
              ollamaBaseUrl={ollamaBaseUrl}
              lmStudioBaseUrl={lmStudioBaseUrl}
              isCoder={activeAgent === 'open'}
              onResetContext={() => {
                clearHistory();
                toast.success('Context reset successful');
              }}
            />
          )}
        </AnimatePresence>

        {/* ─── Input Section ─── */}
        <div className="shrink-0 w-full p-1 bg-background/40 backdrop-blur-3xl z-30">
          <div className={`mx-auto transition-all duration-700 ease-in-out ${prompt.trim().length > 0 ? 'max-w-2xl' : 'max-w-lg'}`}>
            <AnimatePresence>
              {suggestedPrompts.length > 0 && !isLoading && (
                <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }} className="flex flex-wrap gap-1 px-1 mb-1.5">
                  {suggestedPrompts.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setPrompt(s); inputRef.current?.focus(); }}
                      className="px-2.5 py-0.5 rounded-full bg-muted/10 border border-border-strong hover:border-primary/40 text-[9px] font-bold text-foreground/50 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="relative group">
              <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-card/50 backdrop-blur-3xl border border-border-strong/20 rounded-full focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/10 transition-all duration-500 shadow-2xl">
                {/* Left Controls */}
                <div className="shrink-0 flex items-center px-1">
                  <button type="button" onClick={clearHistory} className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-all">
                    <History size={14} strokeWidth={1.5} />
                  </button>
                </div>

                {/* Text Area (Single Row) with Integrated Plus */}
                <div className="flex-1 relative flex items-center group/input">
                  <div className="absolute left-2 z-10">
                    <button 
                      type="button"
                      className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/30 group-focus-within/input:text-primary group-hover/input:text-muted-foreground/60 hover:bg-primary/10 transition-all"
                    >
                      <Plus size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <textarea
                    ref={inputRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                    placeholder="Ask anything..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-[11px] py-1 pl-8 pr-1 resize-none min-h-[28px] max-h-[140px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/30 scrollbar-none text-center"
                  />
                </div>

                {/* Right Controls */}
                <div className="shrink-0">
                  {isLoading ? (
                    <button type="button" onClick={stopCoder} className="h-6 w-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center animate-pulse border border-destructive/20">
                      <StopCircle className="w-3 h-3" />
                    </button>
                  ) : (
                    <button 
                      type="submit" 
                      disabled={!prompt.trim()} 
                      className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                        prompt.trim() 
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-100 hover:scale-105' 
                          : 'bg-muted/20 text-muted-foreground/30 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Send size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* CSS Scrollbar Overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(var(--primary), 0.2); }
      `}} />
    </div>
  );
};
