import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Key, ChevronUp, ChevronDown, Network, Trash2 } from 'lucide-react';
import { AVAILABLE_MODELS } from '@src/features/model-registry/config/models';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';

interface ProviderConfig {
  id: string;
  name: string;
  hasModels: boolean;
  modelCount: number;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: 'gemini', name: 'Google Gemini', hasModels: true, modelCount: 0 },
  { id: 'openrouter', name: 'OpenRouter', hasModels: true, modelCount: 0 },
  { id: 'nvidia', name: 'NVIDIA NIM', hasModels: true, modelCount: 0 },
  { id: 'opencode', name: 'OpenCode Zen', hasModels: true, modelCount: 0 },
];

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  opencode: 'https://opencode.ai/zen/v1',
};

const getModelCountForProvider = (provider: string): number => {
  return AVAILABLE_MODELS.filter(m => m.provider === provider).length;
};

interface ApiKeyVaultProps {
  apiKeys: Record<string, string>;
  vaultStatus: Record<string, boolean>;
  keysInput: Record<string, string>;
  setKeysInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  expandedProvider: string | null;
  toggleExpanded: (providerId: string) => void;
  showGateways: boolean;
  gatewayUrls?: Record<string, string>;
  updateGatewayUrl?: (provider: string, url: string) => void;
  fetchVaultStatus: () => Promise<void>;
  clearApiKeys: () => void;
}

export const ApiKeyVault: React.FC<ApiKeyVaultProps> = ({
  apiKeys,
  vaultStatus,
  keysInput,
  setKeysInput,
  expandedProvider,
  toggleExpanded,
  showGateways,
  gatewayUrls = {},
  updateGatewayUrl = () => {},
  fetchVaultStatus,
  clearApiKeys,
}) => {
  const { usage, resetUsage } = useTokenUsage();

  const providers = PROVIDER_CONFIGS.map(p => ({
    ...p,
    modelCount: getModelCountForProvider(p.id)
  }));

  const getGatewayUrl = (provider: string): string => {
    return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
  };

  const handleSaveToVault = async () => {
    try {
      const res = await fetch('/api/vault/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: keysInput })
      });
      if (res.ok) {
        toast.success('API keys successfully saved to server vault!');
        setKeysInput({});
        await fetchVaultStatus();
      } else {
        toast.error('Failed to save keys to server vault.');
      }
    } catch (e: any) {
      toast.error(`Error saving keys: ${e.message}`);
    }
  };

  const handlePurgeVault = async () => {
    if (confirm("Delete all keys from server vault?")) {
      try {
        const res = await fetch('/api/vault/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: { gemini: '', openrouter: '', nvidia: '', opencode: '' } })
        });
        if (res.ok) {
          toast.success('All API keys removed from server vault');
          await fetchVaultStatus();
          clearApiKeys();
        } else {
          toast.error('Failed to purge server vault.');
        }
      } catch (e: any) {
        toast.error(`Error: ${e.message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {providers.map(p => {
          const hasKey = vaultStatus[p.id];
          const isExpanded = expandedProvider === p.id;
          const providerUsage = usage[p.id];

          return (
            <div key={p.id} className="group p-3.5 rounded-2xl bg-card border border-white/[0.04] hover:border-[#22D3EE]/30 transition-all duration-300 shadow-sm hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 shrink-0 rounded-[10px] flex items-center justify-center text-[10px] font-black uppercase bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/20">
                  {p.name[0]}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/80">{p.name}</p>
                      {hasKey && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#22D3EE] bg-[#22D3EE]/10 px-1.5 py-0.5 rounded-full border border-[#22D3EE]/20">
                          Vault Locked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {providerUsage && hasKey && (
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] font-bold">
                          {providerUsage.totalUSD !== undefined && (
                            <div className="flex flex-col items-start sm:items-end px-1.5 border-r border-white/10">
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#22D3EE]/75">USD</span>
                              <span className="text-[10px] font-mono text-[#22D3EE] font-bold tracking-tight">${(providerUsage.totalUSD - (providerUsage.usedUSD || 0)).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex flex-col items-start sm:items-end px-1.5 border-r border-white/10">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/75">USED</span>
                            <span className="text-[10px] font-mono text-foreground/90 font-bold tracking-tight">{(providerUsage.used / 1000).toFixed(1)}K</span>
                          </div>
                          <div className="flex flex-col items-start sm:items-end px-1.5 border-r border-white/10">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/75">REM</span>
                            <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-tight">{(providerUsage.remaining / 1000).toFixed(1)}K</span>
                          </div>
                          <button 
                            onClick={() => resetUsage(p.id)}
                            className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                          >
                            PURGE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="password" 
                      value={keysInput[p.id] || ''} 
                      onChange={e => setKeysInput(prev => ({ ...prev, [p.id]: e.target.value }))} 
                      placeholder={hasKey ? "••••••••••••••••" : `Enter ${p.name} API key`}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      className="flex-1 bg-background border border-white/[0.04] rounded-xl px-3.5 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-[#22D3EE]/50 shadow-inner" 
                    />
                    <button
                      onClick={() => toggleExpanded(p.id)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        isExpanded ? 'bg-[#22D3EE]/10 border-[#22D3EE]/40 text-[#22D3EE]' : 'bg-white/5 border-white/10 text-muted-foreground/40 hover:text-foreground'
                      }`}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-white/10 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <Key size={10} className="text-[#22D3EE]/60" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
                        {p.modelCount} Models Available
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {AVAILABLE_MODELS.filter(m => m.provider === p.id).slice(0, 20).map(m => (
                        <span 
                          key={m.id} 
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#22D3EE]/5 text-[#22D3EE]/80 border border-[#22D3EE]/10"
                        >
                          {m.name.length > 25 ? m.name.slice(0, 25) + '...' : m.name}
                        </span>
                      ))}
                      {p.modelCount > 20 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground/80 border border-white/5">
                          +{p.modelCount - 20} more
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {showGateways && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 pt-3 border-t border-white/10"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Network size={10} className="text-[#22D3EE]/60" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
                      Gateway URL
                    </span>
                  </div>
                  <input 
                    type="text" 
                    value={getGatewayUrl(p.id)} 
                    onChange={e => updateGatewayUrl(p.id, e.target.value)}
                    placeholder={DEFAULT_GATEWAY_URLS[p.id]}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full bg-background border border-white/[0.04] rounded-xl px-3.5 py-2 text-[10px] font-mono text-muted-foreground/85 focus:border-[#22D3EE]/50 focus:text-foreground transition-all outline-none" 
                  />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(keysInput).some(k => keysInput[k].trim().length > 0) && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSaveToVault}
          className="w-full mt-2 py-2.5 rounded-xl bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-black text-[11px] font-bold uppercase tracking-[0.2em] transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95"
        >
          Save to Server Vault
        </motion.button>
      )}

      <div className="mt-6 flex justify-center">
        <button 
          onClick={handlePurgeVault}
          className="px-6 py-2.5 rounded-full bg-destructive/5 border border-destructive/10 text-destructive text-[11px] font-black uppercase tracking-[0.3em] hover:bg-destructive hover:text-white transition-all group active:scale-95 cursor-pointer"
        >
          <span className="opacity-40 group-hover:opacity-100 flex items-center gap-2">
            <Trash2 size={12} strokeWidth={1.5} />
            PURGE SERVER VAULT
          </span>
        </button>
      </div>
    </div>
  );
};
