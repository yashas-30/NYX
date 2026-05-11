import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { ModelOption } from '../../types';
import { ProviderIcon, getProviderLabel } from '../ui/ProviderIcon';
import { StatusBadge } from '../ui/StatusBadge';
import { NodeToggle } from '../ui/NodeToggle';
import { useTokenUsage } from '../../context/TokenUsageContext';

interface CardHeaderProps {
  model: ModelOption | undefined;
  column: {
    id: string;
    status: 'idle' | 'loading' | 'success' | 'error';
    isSelected?: boolean;
    metadata?: { latency?: number; tokens?: number };
  };
  apiKeys: Record<string, string>;
  showModelSelector: boolean;
  onToggleSelection: () => void;
  onToggleSelector: () => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  model,
  column,
  apiKeys,
  showModelSelector,
  onToggleSelection,
  onToggleSelector,
  providerStatuses
}) => {
  const { usage } = useTokenUsage();

  const currentStatus = useMemo(() => {
    // If the column is loading/error, use that
    if (column.status === 'loading') return 'loading';
    if (column.status === 'error') return 'error';

    // Otherwise, check provider status
    const provider = model?.provider;
    if (!provider || !providerStatuses) return 'idle';

    const status = providerStatuses[provider];
    if (status === 'no-key') return 'no_key';
    if (status === 'offline') return 'offline';
    return 'idle'; // which maps to 'ONLINE' in StatusBadge
  }, [column.status, model?.provider, providerStatuses]);
  
  const isUsageVisible = useMemo(() => {
    const provider = model?.provider;
    if (!provider) return false;
    // Local providers are always visible once started
    if (provider === 'ollama' || provider === 'lmstudio' || provider === 'terminal') return true;
    // Cloud providers require an API key
    return !!apiKeys[provider]?.trim();
  }, [model?.provider, apiKeys]);

  const providerUsage = useMemo(() => {
    if (!model?.provider) return null;
    return usage[model.provider];
  }, [model?.provider, usage]);
  return (
    <div className={`shrink-0 px-4 py-3 flex items-center justify-between gap-2 border-b-2 border-border-strong relative z-10 ${column.isSelected ? 'bg-primary/[0.04]' : 'bg-transparent'}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <NodeToggle isSelected={!!column.isSelected} onToggle={onToggleSelection} />

        {/* Provider icon badge */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 border ${
          column.isSelected ? 'bg-primary/10 border-primary/20 shadow-sm' : 'bg-muted/10 border-border-strong'
        }`}>
          <ProviderIcon
            provider={model?.provider}
            size={12}
            className={column.isSelected ? 'text-primary' : 'text-muted-foreground/60'}
          />
        </div>

        {/* Unified Model Selector Trigger */}
        <div className="relative">
          <button 
            onClick={onToggleSelector}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all duration-300 group/btn ${
              column.isSelected 
                ? 'bg-primary/5 border-primary/20' 
                : 'bg-muted/5 border-border-strong hover:bg-muted/10'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${
              currentStatus === 'loading' ? 'bg-primary animate-pulse' :
              currentStatus === 'idle' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]' :
              currentStatus === 'no_key' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'bg-red-500'
            }`} />
            <span className={`text-[11px] font-bold tracking-tight truncate max-w-[120px] transition-colors ${
              column.isSelected ? 'text-foreground' : 'text-muted-foreground/80 group-hover/btn:text-foreground'
            }`}>
              {model?.name ?? 'Select Unit'}
            </span>
            <ChevronDown size={12} strokeWidth={1.5} className={`text-muted-foreground/30 transition-transform duration-500 group-hover/btn:text-primary ${showModelSelector ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {isUsageVisible && (
          <div className="hidden sm:flex items-center gap-3 mr-1 bg-muted/5 px-2.5 py-1 rounded-full border border-border-strong/50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-1">
              <span className={`text-[8px] font-mono font-black tracking-tighter uppercase transition-colors ${column.metadata?.latency ? 'text-primary' : 'text-muted-foreground/20'}`}>
                {column.metadata?.latency ? `${column.metadata.latency}ms` : '00ms'}
              </span>
              <span className="text-[7px] font-bold text-muted-foreground/10 mx-0.5">/</span>
              <span className={`text-[8px] font-mono font-black tracking-tighter uppercase transition-colors ${column.metadata?.tokens ? 'text-primary' : 'text-muted-foreground/20'}`}>
                {column.metadata?.tokens ?? 0}tk
              </span>
            </div>
            
            {providerUsage && (
              <div className="h-2.5 w-px bg-border-strong/30" />
            )}

            {providerUsage && (
              <div className="text-[7px] font-mono font-black text-muted-foreground/25 tracking-widest uppercase flex items-center">
                {providerUsage.totalUSD !== undefined 
                  ? <span className="text-muted-foreground/40 font-bold">{(providerUsage.totalUSD - (providerUsage.usedUSD || 0)).toFixed(2)}<span className="ml-0.5 text-[6px] opacity-60">USD REM</span></span>
                  : <span>{Math.floor(providerUsage.remaining / 1000)}k<span className="ml-0.5 text-[6px] opacity-60">TK REM</span></span>
                }
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
