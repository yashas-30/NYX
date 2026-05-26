import React, { useMemo, useEffect, useRef } from 'react';
import { Search, Check, Info, Bot, RefreshCw, X, Sparkles, Zap, HardDrive, Cpu, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FREE_OPENCODE_MODELS, CLAUDE_MODELS, AVAILABLE_MODELS, POLLINATIONS_MODELS } from '../../config/models';
import { ModelOption } from '../../types';
import { ProviderIcon, getProviderLabel } from '../ui/ProviderIcon';

interface Props {
  currentModelId?: string;
  allModels: ModelOption[];
  selectedProvider: string;
  searchTerm: string;
  onProviderChange: (p: string) => void;
  onSearchChange: (s: string) => void;
  onSelect: (modelId: string) => void;
  onClose?: () => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  isCoder?: boolean;
  onResetContext?: (modelId: string) => void;
  gatewayUrls?: Record<string, string>;
  dropdown?: boolean;
}

// Structured provider order for the selector
const PROVIDER_ORDER = ['gemini', 'nyx-native', 'opencode', 'openrouter', 'nvidia', 'pollinations'];

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  opencode: 'https://opencode.ai/zen/v1',
  pollinations: 'https://text.pollinations.ai',
};

// Emil Kowalski stagger animations
const listContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.02
    }
  }
};

const listItemVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.97 },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      type: "spring" as any,
      stiffness: 380,
      damping: 28,
      mass: 0.8
    }
  }
};

export const ModelSelector: React.FC<Props> = ({
  currentModelId,
  allModels,
  selectedProvider,
  searchTerm,
  onProviderChange,
  onSearchChange,
  onSelect,
  onClose,
  providerStatuses,
  isCoder,
  onResetContext,
  gatewayUrls = {},
  dropdown = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdown || !onClose) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdown, onClose]);

  const getGatewayUrl = (provider: string): string => {
    return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
  };

  // Combine all models for grouping logic
  const mergedModels = useMemo(() => {
    const extraModels = [...FREE_OPENCODE_MODELS, ...CLAUDE_MODELS, ...POLLINATIONS_MODELS];
    const seenIds = new Set();
    const allSources = [...allModels, ...extraModels];
    return allSources.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      if (!isCoder && (m.provider === 'opencode')) return false;
      return true;
    });
  }, [allModels, isCoder]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, any[]> = {};
    mergedModels.forEach(model => {
      const p = model.provider || 'unknown';
      if (!groups[p]) groups[p] = [];
      groups[p].push(model);
    });
    return groups;
  }, [mergedModels]);

  // Sort providers in structured order
  const sortedProviders = useMemo(() => {
    const providers = Object.keys(groupedModels);
    return providers.sort((a, b) => {
      const aIdx = PROVIDER_ORDER.indexOf(a);
      const bIdx = PROVIDER_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [groupedModels]);

  const filteredModels = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const modelsForProvider = groupedModels[selectedProvider] || [];
    return modelsForProvider.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  }, [groupedModels, selectedProvider, searchTerm]);

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: filteredModels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  return (
    <div 
      ref={containerRef} 
      className={dropdown ? "absolute bottom-full left-0 mb-3.5 z-[500] w-full max-w-[440px]" : "fixed inset-0 z-[500] flex items-center justify-center p-4"}
    >
      {dropdown ? null : (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-md cursor-pointer"
        />
      )}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 12 }} 
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
          transition: {
            type: "spring",
            stiffness: 420,
            damping: 30
          }
        }} 
        exit={{ 
          opacity: 0, 
          scale: 0.95, 
          y: 8,
          transition: {
            duration: 0.18,
            ease: [0.23, 1, 0.32, 1]
          }
        }}
        style={{ transformOrigin: dropdown ? 'bottom left' : 'center' }}
        onClick={(e) => e.stopPropagation()}
        className={dropdown 
          ? "relative w-full bg-card/98 border border-border rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[50vh] backdrop-blur-3xl cursor-default z-[500]"
          : "relative w-full max-w-[440px] bg-card/98 border border-border rounded-3xl shadow-[0_35px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[60vh] backdrop-blur-3xl cursor-default"
        }
      >
        {/* Top Edge Highlight for premium visual depth */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        {/* Selector Header */}
        <div className="p-3 px-4 border-b border-border bg-muted/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-[9px] font-black tracking-[0.25em] text-muted-foreground/60 uppercase truncate">Logic Units</h3>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {/* Search Input Pill */}
            <div className="relative w-36 group">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/35 transition-colors group-focus-within:text-primary" />
              <input 
                autoFocus
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search units..."
                className="w-full bg-muted/40 border border-border rounded-full pl-7.5 pr-2.5 py-1 text-[9px] font-semibold text-foreground focus:outline-none focus:border-primary/45 transition-all shadow-inner placeholder:text-muted-foreground/45"
              />
            </div>
            {onClose && (
              <motion.button 
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onClose}
                className="p-1 rounded-xl text-muted-foreground/45 hover:text-foreground hover:bg-muted/40 transition-all shrink-0 cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </div>
        </div>
        
        {/* Main Content Split Area */}
        <div className="flex flex-1 min-h-0 gap-2.5 p-3 overflow-hidden">
          
          {/* Left Box: Providers (Gateways) */}
          <div className="w-[125px] shrink-0 bg-muted/5 border border-border rounded-2xl flex flex-col p-2 space-y-1 overflow-y-auto custom-scrollbar shadow-inner">
            <span className="px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Gateways</span>
            {sortedProviders.map(provider => {
              const status = providerStatuses?.[provider];
              const isActive = selectedProvider === provider;
              
              return (
                <motion.button
                  key={provider}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => { onProviderChange(provider); onSearchChange(''); }}
                  className={`
                    w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-all duration-300 group cursor-pointer border
                    ${isActive 
                      ? (status === 'no-key' 
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-extrabold' 
                          : 'bg-primary/10 border-primary/25 text-primary font-extrabold shadow-sm') 
                      : 'hover:bg-muted/40 border-transparent text-muted-foreground/60 hover:text-foreground/90'}
                  `}
                >
                  <span className="flex-1 text-left text-[9px] font-bold truncate leading-none">
                    {getProviderLabel(provider)}
                  </span>
                  
                  {/* Status Indicator Glow Dot */}
                  {providerStatuses && (
                    <div className="relative flex items-center shrink-0 ml-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        status === 'online' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)] animate-pulse' :
                        status === 'no-key' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                        'bg-zinc-600'
                      }`} />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Right Box: Models Grid */}
          <div className="flex-1 bg-muted/5 border border-border rounded-2xl overflow-hidden flex flex-col shadow-inner">
            {/* Context Sub-header */}
            <div className="p-2 px-3 border-b border-border flex items-center justify-between bg-muted/10">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Units</span>
              <div className="px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[7px] font-mono font-black text-primary">
                {filteredModels.length.toString().padStart(2, '0')}
              </div>
            </div>
            
            {/* Scrollable list of models */}
            <div ref={parentRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center space-y-2 py-6">
                  <div className="w-8 h-8 rounded-2xl bg-muted/30 flex items-center justify-center border border-dashed border-border">
                    <Bot className="w-4 h-4 opacity-25" />
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-35">None found</p>
                </div>
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const model = filteredModels[virtualItem.index];
                    const isSelected = currentModelId === model.id;
                    const isNoKey = providerStatuses?.[model.provider] === 'no-key';
                    const isOnline = providerStatuses?.[model.provider] === 'online';

                    return (
                      <div
                        key={virtualItem.key}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                          paddingBottom: '6px'
                        }}
                      >
                        <motion.div
                          variants={listItemVariants}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => { onSelect((model as any).realId || model.id); }}
                          className={`
                            flex items-center justify-between gap-2.5 p-2.5 rounded-xl transition-all duration-300 border text-left group relative overflow-hidden cursor-pointer h-full
                            ${isSelected 
                              ? (isNoKey
                                  ? 'bg-amber-500/10 border-amber-500/30'
                                  : 'bg-primary/10 border-primary/25 shadow-sm')
                              : 'bg-card border-border/40 hover:bg-muted/30 hover:border-border'}
                          `}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className={`text-[10px] font-bold truncate leading-none ${isSelected ? 'text-foreground font-black' : 'text-foreground/80'}`}>
                                {model.name}
                              </h4>

                              {/* Reset Context Action (OpenCode only) */}
                              {isCoder && model.provider === 'opencode' && (
                                <motion.button
                                  whileTap={{ scale: 0.85 }}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onResetContext?.(model.id);
                                  }}
                                  className="p-0.5 rounded bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-all ml-1 shadow-sm shrink-0 cursor-pointer"
                                  title="Reset Context"
                                >
                                  <RefreshCw size={8} strokeWidth={2.5} />
                                </motion.button>
                              )}

                              {/* Status Tag */}
                              {providerStatuses && providerStatuses[model.provider] && (
                                <div className={`
                                  text-[6px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] border shrink-0
                                  ${isOnline ? 'bg-primary/8 border-primary/15 text-primary' :
                                    isNoKey ? 'bg-amber-500/8 border-amber-500/15 text-amber-500' :
                                    'bg-red-500/8 border-red-500/15 text-red-400'}
                                `}>
                                  {isOnline ? 'Online' : isNoKey ? 'Auth' : 'Off'}
                                </div>
                              )}

                              {/* Inline Monospace Specs Badge */}
                              {model.specs?.contextWindow && (
                                <span className="text-[6.5px] font-mono font-bold text-muted-foreground/50 bg-muted/40 px-1.5 py-0.5 rounded border border-border shrink-0 ml-auto leading-none">
                                  {model.specs.contextWindow}
                                </span>
                              )}
                            </div>
                            
                            <p className="text-[7.5px] font-mono text-muted-foreground/45 truncate uppercase tracking-tight mt-1 leading-none">
                              {model.description || model.id}
                            </p>
                          </div>

                          {isSelected && (
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 shadow-md ${isNoKey ? 'bg-amber-500' : 'bg-primary'}`}>
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

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