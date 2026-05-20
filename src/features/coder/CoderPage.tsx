/**
 * @file src/features/coder/CoderPage.tsx
 * @description The standalone Coder feature page, integrating the local hook and AIService.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FREE_OPENCODE_MODELS } from '@/src/config/models';
import { 
  Send, Sparkles, Terminal as TerminalIcon, 
  Trash2, Copy, Check, StopCircle, 
  History, Info, ChevronDown, 
  Zap, BrainCircuit, MessageSquare, 
  Settings as SettingsIcon, Save, ArrowDown, Bot, Plus,
  Play, Pause, RotateCcw, X, Paperclip, ArrowRight
} from 'lucide-react';

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;

      const newHeight = Math.max(
        minHeight,
        Math.min(
          textarea.scrollHeight,
          maxHeight ?? Number.POSITIVE_INFINITY
        )
      );

      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}


// UI Components (Shared)
import { Button } from '@/src/components/ui/Button';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { ModelSelector } from '@/src/components/model-card/ModelSelector';

// Feature Logic
import { useCoderLogic } from './hooks/useCoderLogic';

// Core & Config
import { ModelDefinition, Provider } from '@/src/core/types';
import { toast } from 'sonner';
import { ProviderIcon, getProviderLabel } from '@/src/components/ui/ProviderIcon';

const getCustomModelIcon = (model: ModelDefinition | null | undefined) => {
  if (!model) return <Bot className="w-3.5 h-3.5 text-muted-foreground/70" />;
  const provider = model.provider?.toLowerCase() || '';
  const id = model.id?.toLowerCase() || '';

  if (id.includes('claude') || provider.includes('anthropic')) {
    return (
      <svg className="w-3.5 h-3.5 text-[#F15A24]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.8 15.5h-3.6l-.9 2.5H7.2L11 6.1h2l3.8 11.9h-2.1l-.9-2.5zm-.4-1.2l-1.4-3.9-1.4 3.9h2.8z" />
      </svg>
    );
  }
  if (id.includes('gpt') || provider.includes('openai')) {
    return (
      <svg className="w-3.5 h-3.5 text-[#10a37f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (id.includes('gemini') || provider.includes('google') || provider.includes('gemini')) {
    return (
      <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2 7.2 2.4-7.2 2.4-2.4 7.2-2.4-7.2-7.2-2.4 7.2-2.4z" />
      </svg>
    );
  }
  if (provider === 'ollama') {
    return (
      <svg className="w-3.5 h-3.5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a9 9 0 0 0-9 9c0 2.2.8 4.2 2.1 5.7L4 21l3.3-1.1c1.4.7 3 1.1 4.7 1.1a9 9 0 0 0 9-9 9 9 0 0 0-9-9zm0 15a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" />
      </svg>
    );
  }
  if (provider === 'lmstudio') {
    return (
      <svg className="w-3.5 h-3.5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M4 10v4M9 6v12M14 8v8M19 12v0" />
      </svg>
    );
  }
  
  return <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />;
};

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
  // Overridden states
  activeAgent?: 'open' | 'claude' | 'nyx';
  setActiveAgent?: (agent: 'open' | 'claude' | 'nyx') => void;
  models?: Record<'open' | 'claude' | 'nyx', string>;
  setModel?: (modelId: string) => void;
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
  setLocalModelsEnabled = () => {},
  activeAgent: propActiveAgent,
  setActiveAgent: propSetActiveAgent,
  models: propModels,
  setModel: propSetModel
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
    ollamaBaseUrl,
    activeAgent: propActiveAgent,
    setActiveAgent: propSetActiveAgent,
    models: propModels,
    setModel: propSetModel
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
  const { textareaRef: inputRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 72, maxHeight: 300 });

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast.success(`Attached file: ${file.name}`);
    }
  };


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

  const quickModels = useMemo(() => {
    const quick: ModelDefinition[] = [];
    
    const claude = mergedModels.find(m => m.id.toLowerCase().includes('claude-3-5-sonnet') || m.id.toLowerCase().includes('claude-3.5-sonnet'));
    if (claude) quick.push(claude);
    
    const gemini = mergedModels.find(m => m.id.toLowerCase().includes('gemini-2.5-flash') || m.id.toLowerCase().includes('gemini-2-5-flash') || m.id.toLowerCase().includes('gemini-1.5-flash') || m.id.toLowerCase().includes('gemini-1.5-pro'));
    if (gemini) quick.push(gemini);
    
    const gpt = mergedModels.find(m => m.id.toLowerCase().includes('gpt-4o'));
    if (gpt) quick.push(gpt);

    const locals = mergedModels.filter(m => m.isLocal).slice(0, 2);
    quick.push(...locals);

    for (const m of mergedModels) {
      if (quick.length >= 5) break;
      if (!quick.some(q => q.id === m.id)) {
        quick.push(m);
      }
    }
    
    return quick;
  }, [mergedModels]);


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
    adjustHeight(true);
    
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
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full p-4 flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl overflow-hidden shadow-xl relative transition-all duration-500">
        {/* ─── Header ─── */}
        <header className="flex items-center justify-between p-3.5 sm:p-4 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/10 dark:bg-black/10 backdrop-blur-md">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-white/10 dark:border-white/5 backdrop-blur-sm">
              <button 
                onClick={() => setActiveAgent('open')}
                className={`px-3.5 sm:px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  activeAgent === 'open' 
                  ? 'bg-white/80 dark:bg-zinc-800/80 text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                OpenCode
              </button>
              <button 
                onClick={() => setActiveAgent('claude')}
                className={`px-3.5 sm:px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  activeAgent === 'claude' 
                  ? 'bg-white/80 dark:bg-zinc-800/80 text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Claude Code
              </button>
              <button 
                onClick={() => setActiveAgent('nyx')}
                className={`px-3.5 sm:px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  activeAgent === 'nyx' 
                  ? 'bg-purple-500/10 dark:bg-purple-400/10 text-purple-600 dark:text-purple-400 shadow-sm border border-purple-500/20' 
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                NYX
              </button>
            </div>
            <div className="h-4 w-px bg-white/15 dark:bg-white/5 mx-1 hidden sm:block" />
            <div className="flex flex-col hidden sm:flex">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-tight text-foreground/80">{currentPersona.name}</span>
                <span className="text-[7px] font-mono text-muted-foreground bg-white/20 dark:bg-white/5 px-1.5 py-0.5 rounded border border-white/10 dark:border-white/5">v{currentPersona.version}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex items-center gap-2 bg-white/20 dark:bg-white/5 px-2.5 py-1 rounded-xl border border-white/10 dark:border-white/5 shadow-sm group">
              <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform" />
              <div className="flex flex-col min-w-[42px]">
                <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Latency</span>
                <span className="text-[10px] font-mono font-bold leading-none mt-0.5 text-foreground/85">
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
        <div className="flex-1 min-h-0 relative flex flex-col bg-background/5 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none select-none overflow-hidden">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(currentColor 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }} />
          </div>



          <div ref={consoleRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative p-4">
            <div className="w-full space-y-6 pb-4">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[20vh] text-center space-y-4">
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
                      <div className={`flex w-full mb-1 px-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${isUser ? 'text-primary/70 dark:text-primary/95' : 'text-muted-foreground/45'}`}>
                          {isUser ? 'Operator' : 'System'}
                        </span>
                      </div>
                      <div className={`
                        relative max-w-[85%] py-3 px-4 rounded-2xl border transition-all duration-500 shadow-sm
                        ${activeAgent === 'nyx'
                          ? isUser
                            ? 'bg-[#181224]/85 dark:bg-[#120B1C]/90 border-purple-500/30 text-purple-300 dark:text-purple-400 font-mono self-end rounded-tr-none text-[11px] shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                            : msg.status === 'error'
                              ? 'bg-red-950/20 border-red-500/20 text-red-400 self-start rounded-tl-none text-[11px] font-mono'
                              : 'bg-[#0B1A12]/90 dark:bg-[#07140C]/95 border-emerald-500/25 text-emerald-400 font-mono self-start rounded-tl-none pl-4 pr-12 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                          : isUser 
                            ? 'bg-white/60 dark:bg-zinc-800/60 backdrop-blur-md border-white/30 dark:border-white/10 text-foreground/90 self-end rounded-tr-none' 
                            : msg.status === 'error'
                              ? 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400 self-start rounded-tl-none text-xs'
                              : 'bg-white/30 dark:bg-zinc-900/30 backdrop-blur-md border-white/20 dark:border-white/5 text-foreground/90 self-start rounded-tl-none pl-4 pr-12'
                        }
                      `}>
                        {msg.content ? (
                          <>
                            <div className={`leading-[1.7] font-medium tracking-normal whitespace-pre-wrap ${activeAgent === 'nyx' ? 'font-mono tracking-tight text-[11px]' : 'text-xs'}`}>
                              {msg.content}
                              {activeAgent === 'nyx' && msg.status === 'loading' && (
                                <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                              )}
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
                                {(activeAgent === 'claude' || activeAgent === 'nyx') && (
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
                className="absolute bottom-24 right-8 z-20 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform font-black uppercase tracking-widest text-[9px]"
              >
                <ArrowDown className="w-3 h-3" />
                Jump to Latest
              </motion.button>
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
                        onClick={() => { setPrompt(s); inputRef.current?.focus(); }}
                        className="px-2.5 py-1 rounded-full bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/5 hover:border-primary/40 text-[9px] font-bold text-foreground/60 transition-all cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="relative group">
                {/* Advanced Model Selector Popover */}
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
                      isCoder={true}
                      onResetContext={() => {
                        clearHistory();
                        toast.success('Context reset successful');
                      }}
                      gatewayUrls={gatewayUrls}
                      localModelsEnabled={localModelsEnabled}
                      setLocalModelsEnabled={setLocalModelsEnabled}
                      dropdown={true}
                    />
                  )}
                </AnimatePresence>

                {/* Model Settings Parameter Popover */}
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
                    </>
                  )}
                </AnimatePresence>

                {/* Floating Quick Model Dropdown */}
                <AnimatePresence>
                  {showModelDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-[499] bg-transparent" 
                        onClick={() => setShowModelDropdown(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute bottom-full left-0 mb-3 z-[500] w-64 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden p-1.5 flex flex-col"
                      >
                        <div className="px-3 py-2 text-[8px] font-black tracking-widest text-muted-foreground/60 uppercase border-b border-white/10 dark:border-white/5 mb-1 select-none">
                          Quick Select Model
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                          {quickModels.map((model) => {
                            const isSelected = model.id === currentModelId;
                            return (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => {
                                  setModel(model.id);
                                  setShowModelDropdown(false);
                                  toast.success(`Switched model to ${model.name}`);
                                }}
                                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all ${
                                  isSelected 
                                    ? activeAgent === 'nyx'
                                      ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20'
                                      : 'bg-primary/10 text-primary font-bold border border-primary/20'
                                    : 'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="shrink-0 flex items-center justify-center">
                                    {getCustomModelIcon(model)}
                                  </span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-semibold truncate leading-tight">{model.name}</span>
                                    <span className="text-[8px] text-muted-foreground truncate leading-none mt-0.5 uppercase tracking-wide">
                                      {model.isLocal ? 'Local Provider' : getProviderLabel(model.provider)}
                                    </span>
                                  </div>
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-current" strokeWidth={2.5} />}
                              </button>
                            );
                          })}
                        </div>
                        
                        <div className="border-t border-white/10 dark:border-white/5 mt-1.5 pt-1.5 p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowModelDropdown(false);
                              setShowModelSelector(true);
                            }}
                            className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left transition-all hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold ${
                              activeAgent === 'nyx' ? 'text-emerald-400' : 'text-primary'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                            <span>Search & More Models...</span>
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

                {/* Invisible File Input */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileChange} 
                  accept="*/*"
                />

                {/* Prompt Card/Container */}
                <div className={`flex flex-col gap-2 p-2 bg-white/30 dark:bg-zinc-900/70 backdrop-blur-xl border rounded-[24px] transition-all duration-500 shadow-xl ${
                  activeAgent === 'nyx'
                    ? 'border-emerald-500/30 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/10'
                    : 'border-white/30 dark:border-white/15 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/10'
                }`}>
                  {/* File Attachment Pill */}
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

                  {/* Text Area Row */}
                  <div className="flex-1 relative flex items-start group/input">
                    {activeAgent === 'nyx' && (
                      <span className="shrink-0 text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-1 select-none">nyx$</span>
                    )}
                    <textarea
                      ref={inputRef}
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        adjustHeight();
                      }}
                      onKeyDown={(e) => { 
                        if (e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          e.currentTarget.blur(); 
                          handleSubmit(); 
                        } 
                      }}
                      placeholder={activeAgent === 'nyx' ? 'nyx::pipeline ~ ' : 'Ask anything...'}
                      className={`flex-1 bg-transparent border-none focus:ring-0 text-xs py-1 px-1.5 resize-none min-h-[44px] max-h-[220px] font-medium outline-none text-foreground/90 placeholder:text-muted-foreground/45 scrollbar-none text-left ${activeAgent === 'nyx' ? 'font-mono text-emerald-400' : ''}`}
                    />
                  </div>

                  {/* Bottom Toolbar Row */}
                  <div className="flex items-center justify-between border-t border-white/5 dark:border-white/5 pt-1.5 px-1">
                    {/* Left Controls: Selector + Attachment + Settings + Clear */}
                    <div className="flex items-center gap-1.5">
                      {/* Model Selector Dropdown Button */}
                      <button 
                        type="button"
                        onClick={() => {
                          setShowModelDropdown(!showModelDropdown);
                          setShowSettings(false);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 dark:bg-zinc-800/40 hover:bg-white/30 dark:hover:bg-zinc-800/70 border border-white/10 dark:border-white/5 rounded-xl text-[10px] font-semibold text-foreground/80 transition-all select-none ${showModelDropdown ? 'ring-1 ring-primary/40' : ''}`}
                      >
                        <div className="relative flex items-center justify-center">
                          {getCustomModelIcon(currentModel)}
                          <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-card ${
                            badgeStatus === 'success' 
                              ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]' 
                              : badgeStatus === 'loading' 
                                ? 'bg-amber-500 animate-pulse' 
                                : 'bg-muted-foreground/30'
                          }`} />
                        </div>
                        <span className="truncate max-w-[120px]">{currentModel?.name || 'Select Model'}</span>
                        <ChevronDown className={`w-3 h-3 text-muted-foreground/60 transition-transform duration-300 ${showModelDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {/* File Upload Button */}
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded-xl bg-white/20 dark:bg-zinc-800/40 hover:bg-white/30 dark:hover:bg-zinc-800/70 border border-white/10 dark:border-white/5 text-muted-foreground hover:text-foreground transition-all"
                        title="Attach File"
                      >
                        <Paperclip size={12} strokeWidth={1.5} />
                      </button>

                      {/* Settings Button */}
                      <button 
                        type="button"
                        onClick={() => {
                          setShowSettings(!showSettings);
                          setShowModelDropdown(false);
                        }}
                        className={`p-1.5 rounded-xl bg-white/20 dark:bg-zinc-800/40 hover:bg-white/30 dark:hover:bg-zinc-800/70 border border-white/10 dark:border-white/5 text-muted-foreground hover:text-foreground transition-all group ${showSettings ? 'ring-1 ring-primary/40 text-primary' : ''}`}
                        title="Model Parameters"
                      >
                        <SettingsIcon size={12} strokeWidth={1.5} className="group-hover:rotate-45 transition-transform duration-300" />
                      </button>

                      {/* Clear Session / Reset Context Button */}
                      <button 
                        type="button" 
                        onClick={clearHistory} 
                        className="p-1.5 rounded-xl bg-white/20 dark:bg-zinc-800/40 hover:bg-white/30 dark:hover:bg-zinc-800/70 border border-white/10 dark:border-white/5 text-muted-foreground/60 hover:text-destructive hover:border-destructive/20 transition-all group"
                        title="Clear session history"
                      >
                        <History size={12} strokeWidth={1.5} className="group-hover:scale-105 transition-transform" />
                      </button>
                    </div>

                    {/* Right Controls: Send Button */}
                    <div className="flex items-center gap-2">
                      {isLoading ? (
                        <button 
                          type="button" 
                          onClick={stopCoder} 
                          className="h-7 px-3 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center gap-1 border border-destructive/20 text-[10px] font-bold tracking-wider uppercase hover:bg-destructive/20 transition-all"
                        >
                          <StopCircle className="w-3.5 h-3.5 animate-spin" />
                          <span>Stop</span>
                        </button>
                      ) : (
                        <button 
                          type="submit" 
                          disabled={!prompt.trim()} 
                          className={`h-7 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all text-[10px] font-black tracking-widest uppercase ${
                            prompt.trim() 
                              ? activeAgent === 'nyx'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-100 hover:scale-[1.02]'
                                : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-100 hover:scale-[1.02]' 
                              : 'bg-muted/20 text-muted-foreground/30 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <span>Run</span>
                          <ArrowRight size={11} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
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
