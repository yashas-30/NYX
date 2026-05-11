// ─── ModelSelector ────────────────────────────────────────────────────────────
// The dropdown overlay shown when the user clicks the model name in the header.
// Completely self-contained: receives data + callbacks, emits onSelect / onClose.
// This version is synced exactly with the CoderPage.tsx design.

import React, { useMemo } from 'react';
import { Search, BrainCircuit, Check, Info, Bot, ArrowDown, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { FREE_OPENCODE_MODELS } from '../../config/models';
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
}



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
  onResetContext
}) => {
  // Combine all models for grouping logic, similar to CoderPage
  const mergedModels = useMemo(() => {
    const localOllama = ollamaModels.map(m => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as const,
      isLocal: true
    }));
    
    const localLMStudio = lmStudioModels.map(m => ({
      id: m.id,
      name: m.id,
      provider: 'lmstudio' as const,
      isLocal: true
    }));

    // Filter out duplicates if any
    const seenIds = new Set();
    const base = [...allModels, ...localOllama, ...localLMStudio].filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    if (isCoder) {
      return [...base, ...FREE_OPENCODE_MODELS];
    }

    return base;
  }, [allModels, ollamaModels, lmStudioModels, isCoder]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, any[]> = {};
    mergedModels.forEach(model => {
      const p = model.provider || 'unknown';
      if (!groups[p]) groups[p] = [];
      groups[p].push(model);
    });
    return groups;
  }, [mergedModels]);

  const filteredModels = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const modelsForProvider = groupedModels[selectedProvider] || [];
    return modelsForProvider.filter(m => 
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  }, [groupedModels, selectedProvider, searchTerm]);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/60 backdrop-blur-md cursor-pointer"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-card/95 border border-border-strong rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[85vh] backdrop-blur-3xl cursor-default"
      >
        {/* Selector Header */}
        <div className="p-3 px-5 border-b border-border-strong bg-muted/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <BrainCircuit className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground uppercase">Models</h3>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Network</p>
            </div>
          </div>
          <div className="relative w-64">
            <input 
              autoFocus
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search parameters..."
              className="w-full bg-background/50 border border-border-strong rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-primary/50 transition-all shadow-inner font-medium text-foreground placeholder:text-muted-foreground/30"
            />
          </div>
        </div>
        
        <div className="flex flex-1 min-h-0 gap-3 p-4">
          {/* Left Box: Providers */}
          <div className="w-60 bg-muted/10 border border-border-strong rounded-xl flex flex-col p-3 space-y-1.5 overflow-y-auto custom-scrollbar shadow-inner">
            <span className="px-3 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Neural Gateways</span>
            {Object.keys(groupedModels).sort().map(provider => {
              return (
                <button
                  key={provider}
                  onClick={() => { onProviderChange(provider); onSearchChange(''); }}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-300 group
                    ${selectedProvider === provider 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}
                  `}
                >
                  <ProviderIcon 
                    provider={provider} 
                    size={14} 
                    className={selectedProvider === provider ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary'} 
                  />
                  <span className="flex-1 text-left text-[12px] font-bold truncate">{getProviderLabel(provider)}</span>
                  
                  {/* Status Indicator */}
                  {providerStatuses && (
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      providerStatuses[provider] === 'online' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]' :
                      providerStatuses[provider] === 'no-key' ? 'bg-amber-500' :
                      'bg-destructive'
                    }`} />
                  )}

                  {selectedProvider === provider && (
                    <div className="w-1 h-3 rounded-full bg-primary-foreground/30 animate-in fade-in zoom-in duration-300" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Box: Models Grid */}
          <div className="flex-1 bg-muted/10 border border-border-strong rounded-xl overflow-hidden flex flex-col shadow-inner">
            <div className="p-4 border-b border-border-strong flex items-center justify-between bg-muted/5">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Logic Units</span>
              <div className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[8px] font-black uppercase text-primary">
                {filteredModels.length} Units
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-muted/10 flex items-center justify-center border border-border-strong border-dashed">
                    <Bot className="w-6 h-6 opacity-20" />
                  </div>
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">No units found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredModels.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { onSelect((model as any).realId || model.id); }}
                      className={`
                        flex items-center gap-3 p-3 rounded-xl transition-all duration-300 border text-left group relative overflow-hidden
                        ${currentModelId === model.id 
                          ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20' 
                          : 'bg-muted/5 border-border-strong hover:bg-muted/10 hover:border-border-strong'}
                      `}
                    >
                      <div className={`p-2 rounded-lg border transition-all ${currentModelId === model.id ? 'bg-primary text-primary-foreground border-primary/40' : 'bg-background/50 border-border'}`}>
                        <ProviderIcon provider={model.provider} size={12} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-[12px] font-bold truncate ${currentModelId === model.id ? 'text-foreground' : 'text-foreground/80'}`}>
                            {model.name}
                          </h4>
                          {isCoder && model.provider === 'opencode' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onResetContext?.(model.id);
                              }}
                              className="p-1 rounded-md bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all ml-1 shadow-sm"
                              title="Reset Context"
                            >
                              <RefreshCw size={10} strokeWidth={2.5} />
                            </button>
                          )}
                          {providerStatuses && providerStatuses[model.provider] && (
                            <div className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${
                              providerStatuses[model.provider] === 'online' 
                                ? 'bg-primary/10 border-primary/20 text-primary' 
                                : providerStatuses[model.provider] === 'no-key'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                : 'bg-destructive/10 border-destructive/20 text-destructive'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-[2px] ${
                                providerStatuses[model.provider] === 'online' 
                                  ? 'bg-primary' 
                                  : providerStatuses[model.provider] === 'no-key'
                                  ? 'bg-amber-500'
                                  : 'bg-destructive'
                              }`} />
                            </div>
                          )}
                        </div>
                        <p className="text-[8px] font-mono text-muted-foreground/50 truncate uppercase tracking-tighter">
                          {model.id}
                        </p>
                      </div>

                      {currentModelId === model.id && (
                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-3 px-5 border-t border-border-strong bg-muted/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">
            <Info className="w-3 h-3" />
            <span>Total Units: {mergedModels.length}</span>
          </div>
          <button 
            onClick={() => onSelect(currentModelId || '')}
            className="px-6 py-2.5 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            Select Unit
          </button>
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
