// ─── ModelSelector ────────────────────────────────────────────────────────────
// The dropdown overlay shown when the user clicks the model name in the header.
// Completely self-contained: receives data + callbacks, emits onSelect / onClose.
// This version is synced exactly with the CoderPage.tsx design.

import React, { useMemo, useEffect, useRef } from 'react';
import { Search, Check, Info, Bot, ArrowDown, RefreshCw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { FREE_OPENCODE_MODELS, CLAUDE_MODELS, AVAILABLE_MODELS, POLLINATIONS_MODELS } from '../../config/models';
import { ModelOption, OllamaModel, LMStudioModel } from '../../types';
import { UI_TEXT } from '../../lib/design-system/copy';
import { ProviderIcon, getProviderLabel } from '../ui/ProviderIcon';

interface Props {
  currentModelId?: string;
  allModels: ModelOption[];
  ollamaModels: OllamaModel[];
  lmStudioModels: LMStudioModel[];
  selectedProvider: string;
  searchTerm: string;
  onProviderChange: (p: string) => void;
  onSearchChange: (s: string) => void;
  onSelect: (modelId: string) => void;
  onClose?: () => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl?: string;
  lmStudioBaseUrl?: string;
  isCoder?: boolean;
  onResetContext?: (modelId: string) => void;
  gatewayUrls?: Record<string, string>;
  localModelsEnabled: boolean;
  setLocalModelsEnabled: (enabled: boolean) => void;
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

export const ModelSelector: React.FC<Props> = ({
   currentModelId,
   allModels,
   ollamaModels,
   lmStudioModels,
   selectedProvider,
   searchTerm,
   onProviderChange,
   onSearchChange,
   onSelect,
   onClose,
   providerStatuses,
   ollamaBaseUrl,
   lmStudioBaseUrl,
   isCoder,
   onResetContext,
   gatewayUrls = {},
   localModelsEnabled,
   setLocalModelsEnabled,
   dropdown = false
}) => {
   const containerRef = useRef<HTMLDivElement>(null);

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
   // Combine all models for grouping logic, similar to CoderPage
   const mergedModels = useMemo(() => {
     const localOllama = localModelsEnabled ? ollamaModels.map(m => ({
       id: m.name,
       name: m.name,
       provider: 'ollama' as const,
       isLocal: true,
       description: m.size ? `Local Ollama (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : 'Local Ollama model',
       specs: {
         contextWindow: 'Dynamic',
         maxOutput: 'Dynamic',
         modality: 'Text'
       }
     })) : [];
     
     const localLMStudio = localModelsEnabled ? lmStudioModels.map(m => ({
       id: m.id,
       name: m.id,
       provider: 'lmstudio' as const,
       isLocal: true,
       description: 'Local LM Studio model',
       specs: {
         contextWindow: 'Dynamic',
         maxOutput: 'Dynamic',
         modality: 'Text'
       }
     })) : [];

     // Add OpenCode and Claude models that are now in AVAILABLE_MODELS
     // (they're duplicated here for backwards compatibility with existing code)
     const extraModels = [...FREE_OPENCODE_MODELS, ...CLAUDE_MODELS, ...POLLINATIONS_MODELS];

     // Filter out duplicates across all sources
     const seenIds = new Set();
     const allSources = [...allModels, ...localOllama, ...localLMStudio, ...extraModels];
     return allSources.filter(m => {
       if (seenIds.has(m.id)) return false;
       seenIds.add(m.id);
        // Hide opencode models in comparison page — they only work in Coder
        if (!isCoder && (m.provider === 'opencode')) return false;
       return true;
     });
   }, [allModels, ollamaModels, lmStudioModels, localModelsEnabled, isCoder]);

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

  return (
    <div ref={containerRef} className={dropdown ? "absolute bottom-full left-0 mb-3 z-[500] w-full max-w-[440px]" : "fixed inset-0 z-[500] flex items-center justify-center p-4"}>
      {dropdown ? null : (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-background/60 backdrop-blur-md cursor-pointer"
        />
      )}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className={dropdown 
          ? "relative w-full bg-card/95 border border-border-strong rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col max-h-[50vh] backdrop-blur-3xl cursor-default z-[500]"
          : "relative w-full max-w-[440px] bg-card/95 border border-border-strong rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[60vh] backdrop-blur-3xl cursor-default"
        }
      >
        {/* Selector Header */}
        <div className="p-2.5 px-4 border-b border-border-strong bg-muted/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-[10px] font-black tracking-[0.25em] text-foreground uppercase truncate">Logic Units</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-32">
              <input 
                autoFocus
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search..."
                className="w-full bg-background/50 border border-border-strong rounded-lg px-2.5 py-1 text-[9px] focus:outline-none focus:border-primary/50 transition-all shadow-inner font-medium text-foreground placeholder:text-muted-foreground/30"
              />
            </div>
            {onClose && (
              <button 
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-all shrink-0"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-1 min-h-0 gap-2 p-2.5">
          {/* Left Box: Providers */}
          <div className="w-[125px] shrink-0 bg-muted/10 border border-border-strong rounded-xl flex flex-col p-1.5 space-y-1 overflow-y-auto custom-scrollbar shadow-inner">
            <span className="px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Gateways</span>
            {sortedProviders.map(provider => (
              <button
                key={provider}
                type="button"
                onClick={() => { onProviderChange(provider); onSearchChange(''); }}
                className={`
                  w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-all duration-300 group
                  ${selectedProvider === provider 
                    ? (providerStatuses?.[provider] === 'no-key' 
                        ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' 
                        : 'bg-primary text-primary-foreground shadow-lg') 
                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}
                `}
              >
                <span className="flex-1 text-left text-[9px] font-bold truncate leading-none">{getProviderLabel(provider)}</span>
                
                {/* Status Indicator */}
                {providerStatuses && (
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ml-1.5 ${
                    providerStatuses[provider] === 'online' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]' :
                    providerStatuses[provider] === 'no-key' ? 'bg-amber-500' :
                    'bg-destructive'
                  }`} />
                )}
              </button>
            ))}
          </div>

          {/* Right Box: Models Grid */}
          <div className="flex-1 bg-muted/10 border border-border-strong rounded-xl overflow-hidden flex flex-col shadow-inner">
            <div className="p-2 px-3 border-b border-border-strong flex items-center justify-between bg-muted/5">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Units</span>
              <div className="px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[7px] font-black uppercase text-primary">
                {filteredModels.length}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-muted/10 flex items-center justify-center border border-border-strong border-dashed">
                    <Bot className="w-4 h-4 opacity-20" />
                  </div>
                  <p className="text-[8px] font-bold opacity-40 uppercase tracking-widest">None found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {filteredModels.map(model => (
                    <div
                      key={model.id}
                      onClick={() => { onSelect((model as any).realId || model.id); }}
                      className={`
                        flex items-center justify-between gap-2.5 p-2 rounded-lg transition-all duration-300 border text-left group relative overflow-hidden cursor-pointer
                        ${currentModelId === model.id 
                          ? (providerStatuses?.[model.provider] === 'no-key'
                              ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/20'
                              : 'bg-primary/10 border-primary/40 ring-1 ring-primary/20')
                          : 'bg-muted/5 border-border-strong hover:bg-muted/10 hover:border-border-strong'}
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className={`text-[10px] font-bold truncate leading-none ${currentModelId === model.id ? 'text-foreground font-extrabold' : 'text-foreground/80'}`}>
                            {model.name}
                          </h4>
                          {isCoder && model.provider === 'opencode' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  onResetContext?.(model.id);
                              }}
                              className="p-0.5 rounded bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all ml-1 shadow-sm"
                              title="Reset Context"
                            >
                              <RefreshCw size={8} strokeWidth={2.5} />
                            </button>
                          )}
                          {providerStatuses && providerStatuses[model.provider] && (
                            <div className={`w-3 h-3 rounded-[3px] border flex items-center justify-center shrink-0 ${
                              providerStatuses[model.provider] === 'online' 
                                ? 'bg-primary/10 border-primary/20 text-primary' 
                                : providerStatuses[model.provider] === 'no-key'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                : 'bg-destructive/10 border-destructive/20 text-destructive'
                            }`}>
                              <div className={`w-1 h-1 rounded-[1px] ${
                                providerStatuses[model.provider] === 'online' 
                                  ? 'bg-primary' 
                                  : providerStatuses[model.provider] === 'no-key'
                                  ? 'bg-amber-500'
                                  : 'bg-destructive'
                              }`} />
                            </div>
                          )}
                        </div>
                        <p className="text-[7px] font-mono text-muted-foreground/50 truncate uppercase tracking-tighter mt-1 leading-none">
                          {model.description || model.id}
                        </p>
                      </div>

                      {currentModelId === model.id && (
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-lg ${providerStatuses?.[model.provider] === 'no-key' ? 'bg-amber-500 shadow-amber-500/20' : 'bg-primary shadow-primary/20'}`}>
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
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