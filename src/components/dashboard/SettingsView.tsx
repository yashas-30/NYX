import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, ChevronDown, ChevronUp, Key, Network, HelpCircle, BookOpen, ExternalLink, Cpu, Zap, Database, Globe, Terminal as TerminalIcon, Box, Settings as SettingsIcon } from 'lucide-react';
import { UI_TEXT } from '../../lib/design-system/copy';
import { useTokenUsage } from '../../context/TokenUsageContext';
import { AVAILABLE_MODELS } from '../../config/models';
import { toast } from 'sonner';

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
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  lmStudioBaseUrl: string;
  setLmStudioBaseUrl: (url: string) => void;
  gatewayUrls?: Record<string, string>;
  updateGatewayUrl?: (provider: string, url: string) => void;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
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
  ollamaBaseUrl,
  setOllamaBaseUrl,
  lmStudioBaseUrl,
  setLmStudioBaseUrl,
  gatewayUrls = {},
  updateGatewayUrl = () => {},
  activeMode,
  setActiveMode
}) => {
  const { usage, resetUsage, refreshProviderQuota } = useTokenUsage();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showGateways, setShowGateways] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'workflow' | 'keys'>('workflow');
  const [expandedGuideProvider, setExpandedGuideProvider] = useState<string | null>(null);

  const [cacheStats, setCacheStats] = useState<{
    itemCount: number;
    totalSizeBytes: number;
    hits: number;
    misses: number;
  }>({ itemCount: 0, totalSizeBytes: 0, hits: 0, misses: 0 });

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

  useEffect(() => {
    fetchCacheStats();
  }, []);

  const providers = PROVIDER_CONFIGS.map(p => ({
    ...p,
    modelCount: getModelCountForProvider(p.id)
  }));

  const getGatewayUrl = (provider: string): string => {
    return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
  };

  useEffect(() => {
    // Refresh quota for all providers with keys
    providers.forEach(provider => {
      const key = apiKeys[provider.id];
      if (key && key.length > 5) {
        refreshProviderQuota(provider.id, key);
      }
    });
  }, [apiKeys, refreshProviderQuota]);

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
        <header className="flex items-center justify-between p-2.5 sm:p-3 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/10 dark:bg-black/10 backdrop-blur-md">
          <div className="flex items-center gap-1 bg-black/10 dark:bg-white/5 p-0.5 rounded-xl border border-white/10 dark:border-white/5">
            <button 
              onClick={() => setActiveMode?.('coder')} 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'coder' ? 'bg-[#181224]/85 dark:bg-[#120B1C]/90 text-purple-400 border border-purple-500/20 shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              <TerminalIcon size={12} />
              <span>NYX 2.0</span>
            </button>
            <button 
              onClick={() => setActiveMode?.('registry')} 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'registry' ? 'bg-primary text-primary-foreground shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              <Box size={12} />
              <span>Models</span>
            </button>
            <button 
              onClick={() => setActiveMode?.('settings')} 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${activeMode === 'settings' ? 'bg-primary text-primary-foreground shadow-sm font-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            >
              <SettingsIcon size={12} />
              <span>Settings</span>
            </button>
          </div>
          <button
            onClick={() => setShowGateways(!showGateways)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[8px] font-bold uppercase tracking-widest transition-all ${
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
                const hasKey = apiKeys[p.id] && apiKeys[p.id].trim().length > 0;
                const isExpanded = expandedProvider === p.id;

                return (
                  <div key={p.id} className="group p-2.5 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 hover:bg-white/60 dark:hover:bg-zinc-800/40 transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 shrink-0 rounded-[10px] flex items-center justify-center text-[8px] font-black uppercase bg-muted/30 text-muted-foreground/40">
                        {p.name[0]}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <p className="text-[7px] font-black uppercase tracking-[0.1em] text-muted-foreground/30">{p.name}</p>
                            {hasKey && (
                              <span className="text-[5px] font-bold uppercase tracking-widest text-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                                Connected
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {usage[p.id] && hasKey && (
                              <div className="flex items-center gap-2 mr-2">
                                {usage[p.id].totalUSD !== undefined && (
                                  <div className="flex flex-col items-end px-1.5 border-r border-border-strong/20">
                                    <span className="text-[4px] font-black uppercase tracking-widest text-primary/30">USD</span>
                                    <span className="text-[7px] font-mono text-primary font-bold tracking-tight">${(usage[p.id].totalUSD - (usage[p.id].usedUSD || 0)).toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex flex-col items-end px-1.5 border-r border-border-strong/20">
                                  <span className="text-[4px] font-black uppercase tracking-widest text-muted-foreground/20">USED</span>
                                  <span className="text-[7px] font-mono text-foreground/50 font-bold tracking-tight">{(usage[p.id].used / 1000).toFixed(1)}K</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[4px] font-black uppercase tracking-widest text-muted-foreground/20">REM</span>
                                  <span className="text-[7px] font-mono text-emerald-500/50 font-bold tracking-tight">{(usage[p.id].remaining / 1000).toFixed(1)}K</span>
                                </div>
                                <button 
                                  onClick={() => resetUsage(p.id)}
                                  className="text-[4px] font-black uppercase tracking-widest text-muted-foreground/10 hover:text-destructive transition-colors ml-1.5"
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
                            value={apiKeys[p.id] || ''} 
                            onChange={e => updateApiKey(p.id, e.target.value)} 
                            placeholder={`Enter ${p.name} API key`}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                                setTimeout(() => {
                                  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                                }, 100);
                              }
                            }}
                            className="flex-1 bg-muted/10 border border-border rounded-full px-3 py-1.5 text-[8px] font-mono transition-all outline-none border-border text-foreground/80 focus:border-primary/40 shadow-inner" 
                          />
                          <button
                            onClick={() => toggleExpanded(p.id)}
                            className={`p-1.5 rounded-full border border-border-strong/30 transition-all ${
                              isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-foreground'
                            }`}
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 pt-3 border-t border-border/30"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Key size={10} className="text-muted-foreground/30" />
                          <span className="text-[5px] font-black uppercase tracking-widest text-muted-foreground/40">
                            {p.modelCount} Models Available
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {AVAILABLE_MODELS.filter(m => m.provider === p.id).slice(0, 20).map(m => (
                            <span 
                              key={m.id} 
                              className="text-[6px] px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground/60 border border-border/20"
                            >
                              {m.name.length > 25 ? m.name.slice(0, 25) + '...' : m.name}
                            </span>
                          ))}
                          {p.modelCount > 20 && (
                            <span className="text-[6px] px-2 py-0.5 rounded-full bg-muted/10 text-muted-foreground/40">
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
                        className="mt-3 pt-3 border-t border-border/30"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Network size={10} className="text-muted-foreground/30" />
                          <span className="text-[5px] font-black uppercase tracking-widest text-muted-foreground/40">
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
                          className="w-full bg-muted/5 border border-border/20 rounded-lg px-3 py-1.5 text-[7px] font-mono text-muted-foreground/60 focus:border-primary/30 focus:text-foreground/80 transition-all outline-none" 
                        />
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cache Management Panel */}
            <div className="mt-6 group p-4 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 hover:bg-white/50 dark:hover:bg-zinc-800/40 transition-all shadow-md relative overflow-hidden">
              {/* Neon Gradient Accent */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/40 via-purple-500/40 to-primary/40 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.25em] text-primary">CACHE STORAGE MANAGER</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Persistent Query Acceleration</h3>
                </div>
                <span className="text-[5px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                  Active Server
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-muted/10 border border-border rounded-xl p-2.5 flex flex-col justify-between">
                  <span className="text-[5px] font-black text-muted-foreground/45 uppercase tracking-widest">CACHED QUERIES</span>
                  <span className="text-base font-black font-mono text-foreground mt-1">{cacheStats.itemCount}</span>
                </div>
                <div className="bg-muted/10 border border-border rounded-xl p-2.5 flex flex-col justify-between">
                  <span className="text-[5px] font-black text-muted-foreground/45 uppercase tracking-widest">STORAGE USED</span>
                  <span className="text-base font-black font-mono text-foreground mt-1">
                    {cacheStats.totalSizeBytes > 1024 * 1024 
                      ? `${(cacheStats.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                      : `${(cacheStats.totalSizeBytes / 1024).toFixed(1)} KB`
                    }
                  </span>
                </div>
                <div className="bg-muted/10 border border-border rounded-xl p-2.5 flex flex-col justify-between">
                  <span className="text-[5px] font-black text-muted-foreground/45 uppercase tracking-widest">HIT EFFICIENCY</span>
                  <span className="text-base font-black font-mono text-emerald-500 mt-1">
                    {cacheStats.hits + cacheStats.misses > 0
                      ? `${((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)}%`
                      : '0.0%'
                    }
                  </span>
                </div>
              </div>

              {/* Cache Hit visual bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1 text-[6px] font-black uppercase tracking-wider text-muted-foreground/30">
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
                <p className="text-[9px] text-muted-foreground/60 leading-relaxed max-w-[280px]">
                  Persistent query cache automatically mirrors inference results to disk. Submitting identical prompts returns results instantly, saving network credits.
                </p>
                <button
                  onClick={handleClearCache}
                  disabled={cacheStats.itemCount === 0}
                  className={`px-4 py-2 rounded-full border text-[7px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 shrink-0 ${
                    cacheStats.itemCount === 0 
                      ? 'bg-muted/5 border-muted/10 text-muted-foreground/30 cursor-not-allowed' 
                      : 'bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive hover:text-white hover:border-destructive active:scale-95 cursor-pointer'
                  }`}
                >
                  <Trash2 size={10} />
                  Purge Cache
                </button>
              </div>
            </div>

            {/* Learning Hub: App Workflow & Free Keys Guide */}
            <div className="mt-6 group p-4 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 hover:bg-white/50 dark:hover:bg-zinc-800/40 transition-all shadow-md relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500/40 via-primary/40 to-purple-500/40 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between mb-4 border-b border-border-strong/20 pb-3">
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.25em] text-primary">LEARNING & CREDENTIALS HUB</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Walkthrough & Free API Keys</h3>
                </div>
                
                <div className="flex bg-muted/20 p-0.5 rounded-full border border-border">
                  <button
                    onClick={() => setActiveGuideTab('workflow')}
                    className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'workflow'
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Workflow
                  </button>
                  <button
                    onClick={() => setActiveGuideTab('keys')}
                    className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'keys'
                        ? 'bg-primary text-white shadow-sm'
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
                    <div className="bg-muted/5 border border-border-strong/30 rounded-xl p-3 flex flex-col gap-2 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                          <Zap size={12} />
                        </div>
                        <h4 className="text-[9px] font-black uppercase tracking-wide text-foreground">1. Pipeline</h4>
                      </div>
                      <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
                        Vite frontend connects to the local Express gateway (Port 3000). Streaming requests proxy directly to a Fastify stream engine (Port 3001).
                      </p>
                    </div>

                    <div className="bg-muted/5 border border-border-strong/30 rounded-xl p-3 flex flex-col gap-2 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                          <Cpu size={12} />
                        </div>
                        <h4 className="text-[9px] font-black uppercase tracking-wide text-foreground">2. Sockets</h4>
                      </div>
                      <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
                        Fastify disables TCP buffering (Nagle's Algorithm), utilizes pre-warmed DNS lookups, and leverages persistent socket connection pooling.
                      </p>
                    </div>

                    <div className="bg-muted/5 border border-border-strong/30 rounded-xl p-3 flex flex-col gap-2 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                          <Database size={12} />
                        </div>
                        <h4 className="text-[9px] font-black uppercase tracking-wide text-foreground">3. Cache</h4>
                      </div>
                      <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
                        Every request maps to a SHA-256 signature capturing prompt, model parameters, and settings. Cached answers load instantly from disk.
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-muted/5 border border-border/30 rounded-xl p-3 flex flex-col gap-2">
                    <h4 className="text-[9px] font-black uppercase tracking-wide text-foreground">Features Walkthrough</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[8px] text-muted-foreground/80">
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
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/5 hover:bg-muted/10 transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'gemini' ? null : 'gemini')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[7px] font-black">G</div>
                          <span className="text-[10px] font-bold text-foreground">Google Gemini API</span>
                          <span className="text-[6px] font-bold uppercase tracking-widest text-emerald-500/85 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/10">Free Tier</span>
                        </div>
                        {expandedGuideProvider === 'gemini' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'gemini' && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/10 text-[9px] text-muted-foreground/80 space-y-2 leading-relaxed">
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
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/5 hover:bg-muted/10 transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'openrouter' ? null : 'openrouter')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[7px] font-black">O</div>
                          <span className="text-[10px] font-bold text-foreground">OpenRouter API</span>
                          <span className="text-[6px] font-bold uppercase tracking-widest text-emerald-500/85 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/10">Free Models</span>
                        </div>
                        {expandedGuideProvider === 'openrouter' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'openrouter' && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/10 text-[9px] text-muted-foreground/80 space-y-2 leading-relaxed">
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
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/5 hover:bg-muted/10 transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'nvidia' ? null : 'nvidia')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[7px] font-black">N</div>
                          <span className="text-[10px] font-bold text-foreground">NVIDIA NIM API</span>
                          <span className="text-[6px] font-bold uppercase tracking-widest text-emerald-500/85 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/10">Free Credits</span>
                        </div>
                        {expandedGuideProvider === 'nvidia' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'nvidia' && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/10 text-[9px] text-muted-foreground/80 space-y-2 leading-relaxed">
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
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/5 hover:bg-muted/10 transition-all">
                      <button
                        onClick={() => setExpandedGuideProvider(expandedGuideProvider === 'opencode' ? null : 'opencode')}
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[7px] font-black">C</div>
                          <span className="text-[10px] font-bold text-foreground">OpenCode Zen</span>
                          <span className="text-[6px] font-bold uppercase tracking-widest text-emerald-500/85 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/10">Free Sandbox</span>
                        </div>
                        {expandedGuideProvider === 'opencode' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'opencode' && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/10 text-[9px] text-muted-foreground/80 space-y-2 leading-relaxed">
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
                onClick={() => {
                  if (confirm("Delete all keys?")) {
                    clearApiKeys();
                  }
                }}
                className="px-6 py-2.5 rounded-full bg-destructive/5 border border-destructive/10 text-destructive text-[7px] font-black uppercase tracking-[0.3em] hover:bg-destructive hover:text-white transition-all group active:scale-95"
              >
                <span className="opacity-40 group-hover:opacity-100 flex items-center gap-2">
                  <Trash2 size={12} strokeWidth={1.5} />
                  PURGE CORE
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
