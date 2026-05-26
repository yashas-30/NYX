import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Trash2, ChevronDown, ChevronUp, Key, Network, HelpCircle, BookOpen, ExternalLink, Cpu, Zap, Database, Globe, Terminal as TerminalIcon, Box, Settings as SettingsIcon, Brain } from 'lucide-react';
import { UI_TEXT } from '../../lib/design-system/copy';
import { useTokenUsage } from '../../context/TokenUsageContext';
import { AVAILABLE_MODELS } from '../../config/models';
import { toast } from '@/src/components/ui/sonner';

interface ProviderConfig {
  id: string;
  name: string;
  hasModels: boolean;
  modelCount: number;
}

interface SettingsViewProps {
  apiKeys: Record<string, string>;
  updateApiKey: (provider: string, key: string) => void;
  clearApiKeys: () => void;
  gatewayUrls?: Record<string, string>;
  updateGatewayUrl?: (provider: string, url: string) => void;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: 'gemini', name: 'Google Gemini', hasModels: true, modelCount: 0 },
  { id: 'openrouter', name: 'OpenRouter', hasModels: true, modelCount: 0 },
  { id: 'nvidia', name: 'NVIDIA NIM', hasModels: true, modelCount: 0 },
  { id: 'opencode', name: 'OpenCode Zen', hasModels: true, modelCount: 0 },
];

const getModelCountForProvider = (provider: string): number => {
  return AVAILABLE_MODELS.filter(m => m.provider === provider).length;
};

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  opencode: 'https://opencode.ai/zen/v1',
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  apiKeys,
  updateApiKey,
  clearApiKeys,
  gatewayUrls = {},
  updateGatewayUrl = () => {},
  activeMode,
  setActiveMode,
  sidebarOpen = true
}) => {
  const { usage, resetUsage, refreshProviderQuota } = useTokenUsage();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showGateways, setShowGateways] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'workflow' | 'keys'>('workflow');
  const [expandedGuideProvider, setExpandedGuideProvider] = useState<string | null>(null);

  const [vaultStatus, setVaultStatus] = useState<Record<string, boolean>>({});
  const [keysInput, setKeysInput] = useState<Record<string, string>>({});

  const [workspacePath, setWorkspacePath] = useState<string>('');

  const fetchWorkspacePath = async () => {
    try {
      const res = await fetch('/api/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspacePath(data.workspace);
      }
    } catch (e) {
      console.error('Failed to fetch workspace path:', e);
    }
  };

  const handleSelectWorkspace = async () => {
    try {
      const res = await fetch('/api/workspace/select', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setWorkspacePath(data.workspace);
          toast.success(`Active workspace updated: ${data.workspace}`);
        } else if (data.fallback) {
          toast.info('Please enter the workspace directory path in the text field.');
        }
      }
    } catch (e: any) {
      toast.error(`Directory selection failed: ${e.message}`);
    }
  };

  const fetchVaultStatus = async () => {
    try {
      const res = await fetch('/api/vault/status');
      if (res.ok) {
        const data = await res.json();
        setVaultStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch vault status:', e);
    }
  };

  const [cacheStats, setCacheStats] = useState<{
    itemCount: number;
    totalSizeBytes: number;
    hits: number;
    misses: number;
  }>({ itemCount: 0, totalSizeBytes: 0, hits: 0, misses: 0 });

  // ── Quantization / Local Inference State ───────────────────────────────────
  const QUANT_TIERS = [
    { id: 'Q4_K_M', label: 'Speed',    badge: '3–4× faster',  quality: '95%', vram: '~3.9 GB', warn: 'Higher hallucination risk for complex code.' },
    { id: 'Q5_K_M', label: 'Balanced', badge: 'Recommended', quality: '98%', vram: '~4.8 GB', warn: null },
    { id: 'Q6_K',   label: 'Quality',  badge: 'Best output', quality: '99%', vram: '~5.7 GB', warn: null },
  ] as const;
  type QuantTierId = typeof QUANT_TIERS[number]['id'];
  const [selectedQuant, setSelectedQuant] = useState<QuantTierId>(() => {
    return (localStorage.getItem('nyx_quant') as QuantTierId) || 'Q5_K_M';
  });
  const [quantSaving, setQuantSaving] = useState(false);

  const handleQuantChange = async (quantId: QuantTierId) => {
    setSelectedQuant(quantId);
    localStorage.setItem('nyx_quant', quantId);
    setQuantSaving(true);
    try {
      await fetch('/api/nyx/local-models/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantization: quantId })
      });
      toast.success(`Quantization set to ${quantId} — takes effect on next model load.`);
    } catch {
      toast.info(`Quantization saved locally: ${quantId}`);
    } finally {
      setQuantSaving(false);
    }
  };

  const [evolvedRules, setEvolvedRules] = useState<Array<{
    metric: string;
    critique: string;
    rule: string;
    timestamp: number;
  }>>([]);

  const fetchCacheStats = async () => {
    try {
      const res = await fetch('/api/cache/stats');
      if (res.ok) {
        const data = await res.json();
        setCacheStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch cache stats:', e);
    }
  };

  const fetchEvolvedRules = async () => {
    try {
      const res = await fetch('/api/nyx/rules');
      if (res.ok) {
        const data = await res.json();
        setEvolvedRules(data.rules || data || []);
      }
    } catch (e) {
      console.error('Failed to fetch evolved rules:', e);
    }
  };

  const handleClearCache = async () => {
    try {
      const res = await fetch('/api/cache/clear', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        fetchCacheStats();
        toast.success(`Successfully cleared ${data.clearedCount || 0} cached items!`);
      } else {
        toast.error("Failed to clear cache.");
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    }
  };

  const handleClearRules = async () => {
    try {
      const res = await fetch('/api/nyx/reset', { method: 'POST' });
      if (res.ok) {
        setEvolvedRules([]);
        toast.success("Successfully reset evolved memory!");
      } else {
        toast.error("Failed to reset evolved memory.");
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    }
  };

  useEffect(() => {
    fetchCacheStats();
    fetchEvolvedRules();
    fetchVaultStatus();
    fetchWorkspacePath();
  }, []);

  const providers = PROVIDER_CONFIGS.map(p => ({
    ...p,
    modelCount: getModelCountForProvider(p.id)
  }));

  const getGatewayUrl = (provider: string): string => {
    return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
  };

  useEffect(() => {
    providers.forEach(provider => {
      if (vaultStatus[provider.id]) {
        refreshProviderQuota(provider.id);
      }
    });
  }, [vaultStatus, refreshProviderQuota]);

  const toggleExpanded = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
  };

  return (
    <motion.div 
      key="settings" 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -15 }} 
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        <header className={`flex items-center justify-between p-4 ${!sidebarOpen ? 'pl-14' : ''} border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/5 dark:bg-black/10 backdrop-blur-md transition-all duration-300`}>
          <div className="flex items-center gap-2">
            <SettingsIcon size={16} className="text-primary" />
            <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">Settings</h2>
          </div>

          <button
            onClick={() => setShowGateways(!showGateways)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              showGateways 
                ? 'bg-primary/20 text-primary border border-primary/30' 
                : 'bg-muted/20 text-muted-foreground border border-border hover:border-primary/30'
            }`}
          >
            <Network size={12} />
            Gateways
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-xl mx-auto space-y-4 pb-12">
            <div className="space-y-2">
              {providers.map(p => {
                const hasKey = vaultStatus[p.id];
                const isExpanded = expandedProvider === p.id;
                const providerUsage = usage[p.id];

                return (
                  <div key={p.id} className="group p-3.5 rounded-2xl glass-panel hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 shrink-0 rounded-[10px] flex items-center justify-center text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                        {p.name[0]}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/80">{p.name}</p>
                            {hasKey && (
                              <span className="text-[9px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">
                                Vault Locked
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {providerUsage && hasKey && (
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] font-bold">
                                {providerUsage.totalUSD !== undefined && (
                                  <div className="flex flex-col items-start sm:items-end px-1.5 border-r border-white/10">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary/75">USD</span>
                                    <span className="text-[10px] font-mono text-primary font-bold tracking-tight">${(providerUsage.totalUSD - (providerUsage.usedUSD || 0)).toFixed(2)}</span>
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
                                setTimeout(() => {
                                  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                                }, 100);
                              }
                            }}
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-primary/50 shadow-inner" 
                          />
                          <button
                            onClick={() => toggleExpanded(p.id)}
                            className={`p-2 rounded-xl border transition-all cursor-pointer ${
                              isExpanded ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-muted-foreground/40 hover:text-foreground'
                            }`}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-3 border-t border-white/10"
                      >
                        <div className="flex items-center gap-2 mb-2.5">
                          <Key size={10} className="text-primary/60" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
                            {p.modelCount} Models Available
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                          {AVAILABLE_MODELS.filter(m => m.provider === p.id).slice(0, 20).map(m => (
                            <span 
                              key={m.id} 
                              className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/5 text-primary/80 border border-primary/10"
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

                    {showGateways && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 pt-3 border-t border-white/10"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Network size={10} className="text-primary/60" />
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
                              setTimeout(() => {
                                window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                              }, 100);
                            }
                          }}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-[10px] font-mono text-muted-foreground/85 focus:border-primary/50 focus:text-foreground transition-all outline-none" 
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
                onClick={async () => {
                  try {
                    const res = await fetch('/api/vault/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keys: keysInput })
                    });
                    if (res.ok) {
                      toast.success('API keys successfully saved to server vault!');
                      setKeysInput({}); // Clear inputs from memory/DOM
                      fetchVaultStatus();
                    } else {
                      toast.error('Failed to save keys to server vault.');
                    }
                  } catch (e: any) {
                    toast.error(`Error saving keys: ${e.message}`);
                  }
                }}
                className="w-full mt-2 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-background text-[11px] font-black uppercase tracking-[0.2em] transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95"
              >
                Save to Server Vault
              </motion.button>
            )}

            {/* Local Inference Engine Panel - Quality/Speed slider */}
            <div className="mt-6 group p-5 rounded-3xl glass-panel hover:border-primary/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              {/* Violet/Indigo GPU accent */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-violet-500/50 via-indigo-500/50 to-violet-500/50 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-400">LOCAL INFERENCE ENGINE</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Quantization Quality / Speed</h3>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${quantSaving ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-violet-400 bg-violet-500/10 border-violet-500/20'}`}>
                  {quantSaving ? 'Saving...' : selectedQuant}
                </span>
              </div>

              {/* Tier selector cards */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {QUANT_TIERS.map((tier) => {
                  const isSelected = selectedQuant === tier.id;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => handleQuantChange(tier.id)}
                      className={`relative p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? 'bg-violet-500/15 border-violet-500/40 shadow-md shadow-violet-500/10'
                          : 'bg-white/[0.02] border-white/8 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      )}
                      <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isSelected ? 'text-violet-300' : 'text-muted-foreground/80'}`}>
                        {tier.label}
                      </div>
                      <div className={`text-[11px] font-bold font-mono mb-2 ${isSelected ? 'text-foreground' : 'text-foreground/70'}`}>
                        {tier.id}
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                          <span className="text-muted-foreground/60">Quality</span>
                          <span className={isSelected ? 'text-emerald-400' : 'text-muted-foreground/80'}>{tier.quality}</span>
                        </div>
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                          <span className="text-muted-foreground/60">VRAM</span>
                          <span className={isSelected ? 'text-violet-300' : 'text-muted-foreground/80'}>{tier.vram}</span>
                        </div>
                      </div>
                      <span className={`mt-2 inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-muted-foreground/60 border border-white/10'
                      }`}>
                        {tier.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Warning for Q4 tier */}
              {QUANT_TIERS.find(t => t.id === selectedQuant)?.warn && (
                <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/25 text-[10px] text-amber-300 flex items-center gap-2">
                  <span className="text-amber-400 shrink-0">⚠</span>
                  {QUANT_TIERS.find(t => t.id === selectedQuant)?.warn}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                Quantization controls model weight precision. Higher quality tiers reduce hallucinations in code generation. Q5_K_M is the recommended minimum for coding tasks. Takes effect on next model load.
              </p>
            </div>

            {/* Cache Management Panel */}

            <div className="mt-6 group p-5 rounded-3xl glass-panel hover:border-primary/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              {/* Neon Gradient Accent */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 via-cyan-500/30 to-primary/30 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">CACHE STORAGE MANAGER</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Persistent Query Acceleration</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                  Active Server
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 flex flex-col justify-between">
                  <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest">CACHED QUERIES</span>
                  <span className="text-[15px] font-black font-mono text-foreground mt-1.5">{cacheStats.itemCount}</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 flex flex-col justify-between">
                  <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest">STORAGE USED</span>
                  <span className="text-[15px] font-black font-mono text-foreground mt-1.5">
                    {cacheStats.totalSizeBytes > 1024 * 1024 
                      ? `${(cacheStats.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                      : `${(cacheStats.totalSizeBytes / 1024).toFixed(1)} KB`
                    }
                  </span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 flex flex-col justify-between">
                  <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest">HIT EFFICIENCY</span>
                  <span className="text-[15px] font-black font-mono text-primary mt-1.5">
                    {cacheStats.hits + cacheStats.misses > 0
                      ? `${((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)}%`
                      : '0.0%'
                    }
                  </span>
                </div>
              </div>

              {/* Cache Hit visual bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
                  <span>Cache Efficiency Index</span>
                  <span>
                    {cacheStats.hits} Hits / {cacheStats.hits + cacheStats.misses} Total
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-500" 
                    style={{ 
                      width: cacheStats.hits + cacheStats.misses > 0 
                        ? `${Math.min(100, (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)}%`
                        : '0%' 
                    }}
                  />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-4">
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-[280px]">
                  Persistent query cache automatically mirrors inference results to disk. Submitting identical prompts returns results instantly, saving network credits.
                </p>
                <motion.button
                  whileTap={cacheStats.itemCount === 0 ? {} : { scale: 0.95 }}
                  onClick={handleClearCache}
                  disabled={cacheStats.itemCount === 0}
                  className={`px-4.5 py-2.5 rounded-xl border text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 shrink-0 ${
                    cacheStats.itemCount === 0 
                      ? 'bg-muted/5 border-muted/10 text-muted-foreground/30 cursor-not-allowed' 
                      : 'bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive hover:text-white hover:border-destructive cursor-pointer shadow-sm'
                  }`}
                >
                  <Trash2 size={10} />
                  Purge Cache
                </motion.button>
              </div>
            </div>

            {/* Evolved Memory Manager */}
            <div className="mt-6 group p-5 rounded-3xl glass-panel hover:border-primary/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              {/* Cyan Gradient Accent representing cognitive self-evolution */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 via-cyan-500/30 to-primary/30 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">EVOLVED MEMORY MANAGER</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Meta-Cognitive Self-Correction</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                  {evolvedRules.length} Lessons Learned
                </span>
              </div>

              {/* Scrollable list of rules */}
              <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1 mb-4">
                {evolvedRules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                    <Brain className="w-8 h-8 text-muted-foreground/20 animate-pulse" />
                    <p className="text-[11px] text-muted-foreground/80 mt-2 font-medium">No evolved memory rules recorded yet.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 max-w-[240px]">Nyx automatically criticizes itself post-interaction and learns how to improve.</p>
                  </div>
                ) : (
                  evolvedRules.map((rule, idx) => (
                    <div key={idx} className="p-3 border border-white/10 rounded-xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
                          {rule.metric}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/80">
                          {new Date(rule.timestamp).toLocaleDateString()} {new Date(rule.timestamp).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      
                      <div className="text-[11px] text-muted-foreground/90 leading-relaxed italic">
                        "What was wrong: {rule.critique}"
                      </div>
                      
                      <div className="text-[11px] font-mono text-primary bg-primary/5 border border-primary/20 rounded-lg p-2 select-all leading-normal">
                        {rule.rule}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-4">
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-[280px]">
                  Critic processes interactions out-of-band and saves micro-rules that are injected in future runs. This prevents regression and builds robust codebases.
                </p>
                <motion.button
                  whileTap={evolvedRules.length === 0 ? {} : { scale: 0.95 }}
                  onClick={handleClearRules}
                  disabled={evolvedRules.length === 0}
                  className={`px-4.5 py-2.5 rounded-xl border text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 shrink-0 ${
                    evolvedRules.length === 0 
                      ? 'bg-muted/5 border-muted/10 text-muted-foreground/30 cursor-not-allowed' 
                      : 'bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive hover:text-white hover:border-destructive cursor-pointer shadow-sm'
                  }`}
                >
                  <Trash2 size={10} />
                  Reset Memory
                </motion.button>
              </div>
            </div>

            {/* Workspace Directory Configurator */}
            <div className="mt-6 group p-5 rounded-3xl glass-panel hover:border-primary/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              {/* Gold/Orange Accent representing directory structures/projects */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-500/30 via-orange-500/30 to-amber-500/30 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-500">WORKSPACE CONFIGURATOR</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Codebase Scanning Scope</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  File Index Target
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 border border-white/10 rounded-xl bg-white/[0.01]">
                  <div className="flex justify-between items-center mb-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground/80">
                    <span>Active Scanning Directory</span>
                  </div>
                  <div className="text-[11px] font-mono text-foreground/90 select-all break-all bg-black/30 border border-white/5 rounded-lg p-2.5 leading-normal">
                    {workspacePath || 'Loading...'}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSelectWorkspace}
                    className="flex-1 py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-background text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Globe size={12} />
                    Select Directory
                  </motion.button>
                  
                  <input
                    type="text"
                    placeholder="Or paste absolute directory path..."
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val) {
                          try {
                            const res = await fetch('/api/workspace', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ path: val })
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setWorkspacePath(data.workspace);
                              toast.success(`Workspace updated to: ${data.workspace}`);
                              e.currentTarget.value = '';
                            } else {
                              const err = await res.json();
                              toast.error(`Error: ${err.error}`);
                            }
                          } catch (err: any) {
                            toast.error(`Failed to update workspace: ${err.message}`);
                          }
                        }
                      }
                    }}
                    className="flex-[2] bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-amber-500/50 shadow-inner"
                  />
                </div>
                
                <p className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1">
                  Specifies the root directory for RAG codebase search indexing and terminal execution. Clicking "Select Directory" opens the native OS folder picker.
                </p>
              </div>
            </div>

            {/* Learning Hub: App Workflow & Free Keys Guide */}
            <div className="mt-6 group p-5 rounded-3xl glass-panel hover:border-primary/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/30 via-cyan-500/30 to-primary/30 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">LEARNING & CREDENTIALS HUB</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Walkthrough & Free API Keys</h3>
                </div>
                
                <div className="flex bg-white/10 dark:bg-zinc-900/40 p-0.5 rounded-full border border-white/10">
                  <button
                    onClick={() => setActiveGuideTab('workflow')}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'workflow'
                        ? 'bg-primary text-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Workflow
                  </button>
                  <button
                    onClick={() => setActiveGuideTab('keys')}
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'keys'
                        ? 'bg-primary text-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Free Keys
                  </button>
                </div>
              </div>

              {activeGuideTab === 'workflow' ? (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                    NYX runs on a high-speed, dual-server framework designed for side-by-side LLM comparisons, prompt engineering, and offline local development. Here is how your requests are routed:
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                          <Zap size={12} />
                        </div>
                        <h4 className="text-[11px] font-black uppercase tracking-wide text-foreground">1. Pipeline</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Vite frontend connects to the local Express gateway (Port 3000). Streaming requests proxy directly to a Fastify stream engine (Port 3001).
                      </p>
                    </div>

                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                          <Cpu size={12} />
                        </div>
                        <h4 className="text-[11px] font-black uppercase tracking-wide text-foreground">2. Sockets</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Fastify disables TCP buffering (Nagle's Algorithm), utilizes pre-warmed DNS lookups, and leverages persistent socket connection pooling.
                      </p>
                    </div>

                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                          <Database size={12} />
                        </div>
                        <h4 className="text-[11px] font-black uppercase tracking-wide text-foreground">3. Cache</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Every request maps to a SHA-256 signature capturing prompt, model parameters, and settings. Cached answers load instantly from disk.
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2">
                    <h4 className="text-[11px] font-black uppercase tracking-wide text-foreground">Features Walkthrough</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground/90">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                        <span><strong>Compare Workspace</strong>: Benchmark model outputs side-by-side.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                        <span><strong>Performance Evaluation</strong>: Evaluate reasoning, response depth, & code.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                        <span><strong>Agent Workspace</strong>: Specialized editor with multiline code playground.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-primary shrink-0" />
                        <span><strong>Model Registry</strong>: Manage model configurations & discover local instances.</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                    Acquire free developer API keys to start using NYX at zero cost. Follow the step-by-step instructions below for each provider:
                  </p>

                  <div className="space-y-2">
                    {/* Google Gemini Key */}
                    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'gemini' ? null : 'gemini')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">G</div>
                          <span className="text-[10px] font-bold text-foreground">Google Gemini API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Tier</span>
                        </div>
                        {expandedGuideProvider === 'gemini' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'gemini' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>Google offers robust free tiers for Google Gemini keys directly within Google AI Studio, granting developers massive rate limits at no cost.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Go to the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-bold inline-flex items-center gap-0.5">Google AI Studio Console <ExternalLink size={8} /></a>.</li>
                            <li>Log in with any Google account.</li>
                            <li>Click the prominent <strong>"Get API Key"</strong> or <strong>"Create API Key"</strong> button on the sidebar.</li>
                            <li>Select <strong>"Create API key in new project"</strong>.</li>
                            <li>Copy the generated key (starts with <code>AIzaSy...</code>) and paste it into the <strong>Google Gemini</strong> key field on this settings page.</li>
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* OpenRouter Key */}
                    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'openrouter' ? null : 'openrouter')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">O</div>
                          <span className="text-[10px] font-bold text-foreground">OpenRouter API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Models</span>
                        </div>
                        {expandedGuideProvider === 'openrouter' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'openrouter' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>OpenRouter is an aggregator offering low-latency API access. Creating an account gives you instant access to multiple entirely free LLMs.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Visit the <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-bold inline-flex items-center gap-0.5">OpenRouter Website <ExternalLink size={8} /></a>.</li>
                            <li>Register or log in via GitHub, Google, or MetaMask.</li>
                            <li>Go to <strong>Settings ➔ Keys</strong> in the dashboard or sidebar.</li>
                            <li>Click <strong>"Create Key"</strong>, name it, and copy the new key (starts with <code>sk-or-...</code>).</li>
                            <li>Paste the key into the <strong>OpenRouter</strong> key field. OpenRouter free models like <code>meta-llama/llama-3-8b-instruct:free</code> will run instantly at zero cost!</li>
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* NVIDIA NIM Key */}
                    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'nvidia' ? null : 'nvidia')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">N</div>
                          <span className="text-[10px] font-bold text-foreground">NVIDIA NIM API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Credits</span>
                        </div>
                        {expandedGuideProvider === 'nvidia' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'nvidia' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>NVIDIA Developer Program equips developers with 1,000 free inference credits to benchmark state-of-the-art hosted models.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Navigate to the <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-bold inline-flex items-center gap-0.5">NVIDIA NGC Catalog <ExternalLink size={8} /></a>.</li>
                            <li>Sign up for a free NVIDIA developer account.</li>
                            <li>Once registered, select any model (e.g. Llama 3.3 Nemotron) and click on <strong>"Get API Key"</strong>.</li>
                            <li>Generate and copy your developer key (starts with <code>nvapi-</code>).</li>
                            <li>Paste the key into the <strong>NVIDIA NIM</strong> key field to consume your free credits.</li>
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* OpenCode Key */}
                    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'opencode' ? null : 'opencode')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">C</div>
                          <span className="text-[10px] font-bold text-foreground">OpenCode Zen</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Sandbox</span>
                        </div>
                        {expandedGuideProvider === 'opencode' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'opencode' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>OpenCode Zen provides optimized developer sandbox keys to connect with code-specialized AI reasoning models.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Visit the <a href="https://opencode.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-bold inline-flex items-center gap-0.5">OpenCode Portal <ExternalLink size={8} /></a>.</li>
                            <li>Click **Register** to create a developer account.</li>
                            <li>Navigate to the API Tokens section in your account dashboard.</li>
                            <li>Click **Generate Token**, name it, copy it, and paste it into the **OpenCode Zen** key field on this settings page.</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-10 flex justify-center">
              <button 
                onClick={async () => {
                  if (confirm("Delete all keys from server vault?")) {
                    try {
                      const res = await fetch('/api/vault/store', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ keys: { gemini: '', openrouter: '', nvidia: '', opencode: '' } })
                      });
                      if (res.ok) {
                        toast.success('All API keys removed from server vault');
                        fetchVaultStatus();
                        clearApiKeys();
                      } else {
                        toast.error('Failed to purge server vault.');
                      }
                    } catch (e: any) {
                      toast.error(`Error: ${e.message}`);
                    }
                  }
                }}
                className="px-6 py-2.5 rounded-full bg-destructive/5 border border-destructive/10 text-destructive text-[11px] font-black uppercase tracking-[0.3em] hover:bg-destructive hover:text-white transition-all group active:scale-95 cursor-pointer"
              >
                <span className="opacity-40 group-hover:opacity-100 flex items-center gap-2">
                  <Trash2 size={12} strokeWidth={1.5} />
                  PURGE SERVER VAULT
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
