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
  Settings as SettingsIcon, Save, ArrowDown, Bot, Plus,
  Play, Pause, RotateCcw, X
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
  gatewayUrls?: Record<string, string>;
  localModelsEnabled?: boolean;
  setLocalModelsEnabled?: (enabled: boolean) => void;
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
  ollamaBaseUrl,
  gatewayUrls = {},
  localModelsEnabled = false,
  setLocalModelsEnabled = () => {}
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
  const [speedReadText, setSpeedReadText] = useState<string | null>(null);

  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentPersona = agentPersonas[activeAgent];
  const currentModelId = models[activeAgent];
  
  const mergedModels = useMemo(() => {
    const localOllama: ModelDefinition[] = (ollamaModels || []).map(m => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as Provider,
      isLocal: true,
      description: m.size ? `Local Ollama (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : 'Local Ollama model',
      specs: {
        contextWindow: 'Dynamic',
        maxOutput: 'Dynamic',
        modality: 'Text'
      }
    }));
    
    const localLMStudio: ModelDefinition[] = (lmStudioModels || []).map(m => ({
      id: m.id || m.name,
      name: m.name,
      provider: 'lmstudio' as Provider,
      isLocal: true,
      description: 'Local LM Studio model',
      specs: {
        contextWindow: 'Dynamic',
        maxOutput: 'Dynamic',
        modality: 'Text'
      }
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
    
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    runCoder(prompt);
    setPrompt('');
    
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }, 100);
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
    <motion.div
      key="coder"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="h-full w-full p-[2vw] flex flex-col min-h-0 overflow-hidden bg-background"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col bg-card/40 backdrop-blur-3xl border border-border-strong/30 rounded-2xl overflow-hidden shadow-2xl relative">
        {/* ─── Header ─── */}
        <header className="flex items-center justify-between p-3 sm:p-4 border-b border-border-strong/20 shrink-0 select-none bg-background/25">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex bg-muted/20 p-0.5 rounded-lg border border-border-strong">
              <button 
                onClick={() => setActiveAgent('open')}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all duration-300 ${
                  activeAgent === 'open' 
                  ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' 
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                OpenCode
              </button>
              <button 
                onClick={() => setActiveAgent('claude')}
                className={`px-2.5 sm:px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all duration-300 ${
                  activeAgent === 'claude' 
                  ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' 
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Claude Code
              </button>
            </div>
            <div className="h-4 w-px bg-border-strong mx-1 hidden sm:block" />
            <div className="flex flex-col hidden sm:flex">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-tight text-foreground">{currentPersona.name}</span>
                <span className="text-[7px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">v{currentPersona.version}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex items-center gap-1.5 bg-secondary/40 px-2 py-1 rounded-xl border border-border-strong shadow-inner group">
              <Zap className="w-2.5 h-2.5 text-primary group-hover:scale-110 transition-transform" />
              <div className="flex flex-col min-w-[40px]">
                <span className="text-[6px] font-black text-muted-foreground uppercase leading-none">Latency</span>
                <span className="text-[9px] font-mono font-bold leading-none mt-0.5">
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
              <Trash2 size={12} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </header>

        {/* ─── Terminal Body ─── */}
        <div className="flex-1 min-h-0 relative flex flex-col bg-background/10 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none select-none overflow-hidden">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          </div>

          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-2 p-1 bg-background/50 backdrop-blur-2xl border border-border-strong rounded-xl shadow-2xl">
            <button 
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="flex items-center gap-2 px-3 py-1 hover:bg-muted/50 rounded-lg transition-all group"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${badgeStatus === 'success' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]' : 'bg-muted-foreground/30'}`} />
              <span className="text-[10px] font-bold text-foreground/90">{currentModel?.name || 'Select Model'}</span>
              <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-500 ${showModelSelector ? 'rotate-180' : ''}`} />
            </button>
            <div className="w-px h-4 bg-border-strong my-auto mx-0.5" />
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 rounded-lg transition-all group ${showSettings ? 'bg-primary/20 text-primary' : 'hover:bg-primary/10 text-muted-foreground'}`} 
              title="Model Settings"
            >
              <SettingsIcon size={12} strokeWidth={1.5} className="group-hover:text-primary" />
            </button>
          </div>

          {/* Model Settings Panel Overlay */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-72 bg-card/95 backdrop-blur-3xl border border-border-strong rounded-2xl shadow-2xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parameters</span>
                  <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><Check size={14} strokeWidth={1.5} /></button>
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
                      onChange={(e) => setModelSettings({ ...modelSettings, temperature: parseFloat(e.target.value) })}
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
                      onChange={(e) => setModelSettings({ ...modelSettings, maxTokens: parseInt(e.target.value) })}
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
            )}
          </AnimatePresence>

          <div ref={consoleRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative px-6 py-6 lg:px-10">
            <div className="w-full space-y-6 pb-20">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-125 animate-pulse" />
                    <TerminalIcon className="w-8 h-8 text-primary relative z-10" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-sm font-bold tracking-tight text-foreground">Awaiting Instructions</h2>
                    <p className="text-muted-foreground max-w-xs mx-auto text-[10px] leading-relaxed">
                      Industrial-grade AI guidance for infrastructure and deployment.
                    </p>
                  </div>
                </div>
              ) : (
                history.map((msg, i) => {
                  const isUser = msg.role === 'user';
                  return (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col w-full group mb-6"
                    >
                      <div className={`flex w-full mb-1 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[8px] font-black uppercase tracking-[0.15em] ${isUser ? 'text-primary' : 'text-muted-foreground/30'}`}>
                          {isUser ? 'Operator' : 'System'}
                        </span>
                      </div>
                      <div className={`
                        relative max-w-[85%] py-2.5 rounded-xl border transition-all duration-500
                        ${isUser 
                          ? 'bg-card border-border-strong text-foreground/90 self-end rounded-tr-none shadow-sm text-xs px-4' 
                          : msg.status === 'error'
                            ? 'bg-destructive/5 border-destructive/20 text-destructive self-start rounded-tl-none text-xs px-4'
                            : 'bg-card/20 backdrop-blur-xl border-border border-border-strong/40 self-start rounded-tl-none shadow-sm text-xs pl-4 pr-12'
                        }
                      `}>
                        {msg.content ? (
                          <>
                            <div className="leading-[1.6] font-medium tracking-normal whitespace-pre-wrap">
                              {msg.content}
                            </div>
                            {!isUser && msg.content && msg.status !== 'error' && (
                              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                                <button 
                                  onClick={() => copyToClipboard(msg.content, `msg-${i}`)}
                                  className="p-1 rounded bg-background/80 hover:bg-background border border-border-strong/40 hover:border-border-strong text-muted-foreground hover:text-foreground transition-all"
                                  title="Copy message"
                                >
                                  {copiedId === `msg-${i}` ? <Check size={10} /> : <Copy size={10} />}
                                </button>
                                {activeAgent === 'claude' && (
                                  <button 
                                    onClick={() => setSpeedReadText(msg.content)}
                                    className="p-1 rounded bg-background/80 hover:bg-background border border-border-strong/40 hover:border-border-strong text-muted-foreground hover:text-primary transition-all flex items-center gap-0.5"
                                    title="Speed Read (RSVP)"
                                  >
                                    <Zap size={10} className="text-primary fill-primary/10" />
                                    <span className="text-[9px] font-bold px-0.5">Speed Read</span>
                                  </button>
                                )}
                              </div>
                            )}
                            {!isUser && msg.metrics && (
                              <div className="mt-3 pt-2 border-t border-border-strong/20 flex items-center justify-end gap-2.5 opacity-40 hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-1">
                                  <Zap className="w-2 h-2 text-primary" />
                                  <span className="text-[8px] font-mono font-bold tracking-wider uppercase">
                                    {msg.metrics.tps} <span className="text-[6px] opacity-40">t/s</span>
                                  </span>
                                </div>
                                <div className="w-px h-1.5 bg-border-strong/50" />
                                <div className="flex items-center gap-1">
                                  <BrainCircuit className="w-2 h-2 text-primary" />
                                  <span className="text-[8px] font-mono font-bold tracking-wider uppercase">
                                    {msg.metrics.tokens} <span className="text-[6px] opacity-40">units</span>
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col gap-2 py-1">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 self-start animate-pulse">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-primary">Executing...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
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
                className="absolute bottom-20 right-10 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-2xl font-black uppercase tracking-widest text-[8px]"
              >
                <ArrowDown className="w-3 h-3" />
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
                 gatewayUrls={gatewayUrls}
                 localModelsEnabled={localModelsEnabled}
                 setLocalModelsEnabled={setLocalModelsEnabled}
               />
             )}
          </AnimatePresence>

          {/* Speed Reader Overlay */}
          {speedReadText && (
            <SpeedReaderOverlay 
              text={speedReadText} 
              onClose={() => setSpeedReadText(null)} 
            />
          )}

          {/* ─── Input Section ─── */}
          <div className="shrink-0 w-full p-2 bg-background/25 border-t border-border-strong/20 z-30">
            <div className={`mx-auto transition-all duration-700 ease-in-out ${prompt.trim().length > 0 ? 'max-w-2xl' : 'max-w-md'}`}>
              <AnimatePresence>
                {suggestedPrompts.length > 0 && !isLoading && (
                  <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }} className="flex flex-wrap gap-1 px-1 mb-1.5">
                    {suggestedPrompts.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setPrompt(s); inputRef.current?.focus(); }}
                        className="px-2 py-0.5 rounded-full bg-muted/10 border border-border-strong hover:border-primary/40 text-[8px] font-bold text-foreground/50 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="relative group">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-card/60 backdrop-blur-3xl border border-border-strong/20 rounded-full focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/10 transition-all duration-500 shadow-2xl">
                  {/* Left Controls */}
                  <div className="shrink-0 flex items-center px-0.5">
                    <button type="button" onClick={clearHistory} className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-all">
                      <History size={12} strokeWidth={1.5} />
                    </button>
                  </div>

                  {/* Text Area (Single Row) with Integrated Plus */}
                  <div className="flex-1 relative flex items-center group/input">
                    <div className="absolute left-1 z-10">
                      <button 
                        type="button"
                        className="w-4 h-4 rounded-full flex items-center justify-center text-muted-foreground/30 group-focus-within/input:text-primary group-hover/input:text-muted-foreground/60 hover:bg-primary/10 transition-all"
                      >
                        <Plus size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                    <textarea
                      ref={inputRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => { 
                        if (e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          e.currentTarget.blur(); 
                          handleSubmit(); 
                        } 
                      }}
                      placeholder="Ask anything..."
                      className="flex-1 bg-transparent border-none focus:ring-0 text-[10px] py-1 pl-6 pr-1 resize-none min-h-[24px] max-h-[100px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/30 scrollbar-none text-left"
                    />
                  </div>

                  {/* Right Controls */}
                  <div className="shrink-0">
                    {isLoading ? (
                      <button type="button" onClick={stopCoder} className="h-5 w-5 rounded-full bg-destructive/10 text-destructive flex items-center justify-center animate-pulse border border-destructive/20">
                        <StopCircle className="w-2.5 h-2.5" />
                      </button>
                    ) : (
                      <button 
                        type="submit" 
                        disabled={!prompt.trim()} 
                        className={`h-5 w-5 rounded-full flex items-center justify-center transition-all ${
                          prompt.trim() 
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-100 hover:scale-105' 
                            : 'bg-muted/20 text-muted-foreground/30 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <Send size={12} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
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
    </motion.div>
  );
};

// RSVP Parsing and Speed Reader Sub-components

interface RSVPWord {
  text: string;
  left: string;
  orp: string;
  right: string;
  delayFactor: number;
}

function parseTextToRSVPWords(text: string): RSVPWord[] {
  // Strip code blocks since reading code line-by-line is hard
  let cleanedText = text.replace(/```[\s\S]*?```/g, ' [Code Block] ');
  // Clean up inline backticks but keep content
  cleanedText = cleanedText.replace(/`([^`]+)`/g, '$1');
  // Strip markdown formatting like bold/italics
  cleanedText = cleanedText.replace(/[\*_]{1,3}/g, '');

  const rawWords = cleanedText.split(/\s+/).filter(w => w.trim().length > 0);

  return rawWords.map(word => {
    let delayFactor = 1.0;
    const lastChar = word.slice(-1);
    if (['.', '?', '!'].includes(lastChar)) {
      delayFactor = 2.2;
    } else if ([',', ';', ':', '-'].includes(lastChar)) {
      delayFactor = 1.6;
    }

    // Clean word to determine ORP index
    const cleanWord = word.replace(/^[^\w\d]+|[^\w\d]+$/g, '');
    const cleanLen = cleanWord.length;
    
    let orpIndex = 0;
    if (cleanLen <= 1) {
      orpIndex = 0;
    } else if (cleanLen <= 5) {
      orpIndex = 1;
    } else if (cleanLen <= 9) {
      orpIndex = 2;
    } else if (cleanLen <= 13) {
      orpIndex = 3;
    } else {
      orpIndex = 4;
    }

    const startIndex = word.indexOf(cleanWord);
    const absoluteOrpIndex = startIndex >= 0 ? startIndex + orpIndex : orpIndex;

    const left = word.substring(0, absoluteOrpIndex);
    const orp = word.charAt(absoluteOrpIndex) || '';
    const right = word.substring(absoluteOrpIndex + 1);

    return {
      text: word,
      left,
      orp,
      right,
      delayFactor
    };
  });
}

interface SpeedReaderOverlayProps {
  text: string;
  onClose: () => void;
}

const SpeedReaderOverlay: React.FC<SpeedReaderOverlayProps> = ({ text, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(600);

  const words = useMemo(() => {
    return parseTextToRSVPWords(text);
  }, [text]);

  const currentWord = words[currentIndex];

  const togglePlay = () => setIsPlaying(p => !p);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentIndex >= words.length - 1) {
      setIsPlaying(false);
      return;
    }

    const baseDelay = (60 / wpm) * 1000;
    const currentWordObj = words[currentIndex];
    const delay = baseDelay * (currentWordObj?.delayFactor || 1.0);

    const timer = setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, wpm, words]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.code === 'Escape') {
        onClose();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIndex(prev => Math.max(0, prev - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIndex(prev => Math.min(words.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [words.length, onClose]);

  const progressPercent = words.length > 1 ? (currentIndex / (words.length - 1)) * 100 : 0;

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-card/95 border border-border-strong/40 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-border-strong/10">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary fill-primary/10" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">RSVP Speed Reader</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Close Speed Reader (Esc)"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="relative border-y border-border-strong/20 py-8 my-6 flex justify-center items-center font-mono text-4xl font-bold select-none h-24 overflow-hidden bg-muted/5">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-0.5 h-3.5 bg-primary" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-0.5 h-3.5 bg-primary" />
          
          <div className="absolute left-6 right-6 top-3 border-t border-border-strong/5" />
          <div className="absolute left-6 right-6 bottom-3 border-b border-border-strong/5" />

          <div className="flex w-full">
            <div className="flex-1 text-right text-foreground pr-[0.05em] overflow-hidden whitespace-nowrap">
              {currentWord?.left || ""}
            </div>
            <span className="text-primary select-none shrink-0 text-center flex-none font-bold" style={{ width: '1ch' }}>
              {currentWord?.orp || (currentIndex === 0 ? "" : " ")}
            </span>
            <div className="flex-1 text-left text-foreground/80 pl-[0.05em] overflow-hidden whitespace-nowrap">
              {currentWord?.right || ""}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono font-bold text-muted-foreground uppercase">
            <span>Word {currentIndex + 1} of {words.length}</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="relative w-full h-1.5 bg-muted rounded-full overflow-hidden group/progress cursor-pointer">
            <input 
              type="range" 
              min={0} 
              max={words.length - 1} 
              value={currentIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentIndex(Number(e.target.value));
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div 
              className="h-full bg-primary rounded-full transition-all duration-100" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-3 border-t border-border-strong/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentIndex(0);
                }}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all border border-border-strong/30"
                title="Restart"
              >
                <RotateCcw size={14} strokeWidth={1.5} />
              </button>
              <button 
                onClick={togglePlay}
                className="p-2 rounded-xl bg-primary text-primary-foreground hover:scale-105 transition-all shadow-lg shadow-primary/25 border border-primary flex items-center justify-center w-9 h-9"
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
              </button>
            </div>

            <div className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 rounded-xl border border-border-strong/40">
              <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground shrink-0">WPM: {wpm}</span>
              <input 
                type="range" 
                min={200} 
                max={1000} 
                step={50} 
                value={wpm} 
                onChange={(e) => setWpm(Number(e.target.value))}
                className="w-24 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[8px] font-bold text-muted-foreground/60 uppercase">
            <span>[Space] Play/Pause • [Arrows] Step • [Esc] Close</span>
            <div className="flex gap-1.5">
              {[300, 450, 600, 750, 900].map((preset) => (
                <button 
                  key={preset}
                  onClick={() => setWpm(preset)}
                  className={`px-1.5 py-0.5 rounded border transition-all ${
                    wpm === preset 
                      ? 'bg-primary/10 border-primary text-primary' 
                      : 'border-border hover:border-muted-foreground/30 hover:text-muted-foreground'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
