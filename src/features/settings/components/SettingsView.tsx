import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Network, HelpCircle, BookOpen, ExternalLink, Cpu, Zap, Database, Globe, Settings as SettingsIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

import { ApiKeyVault } from './ApiKeyVault';
import { WorkspaceConfig } from './WorkspaceConfig';
import { ModelSettingsSection } from './ModelSettingsSection';
import { EvolutionaryRules } from './EvolutionaryRules';
import { CacheClean } from './CacheClean';

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

const QUANT_TIERS = ['Q4_K_M', 'Q5_K_M', 'Q6_K'] as const;
type QuantTierId = typeof QUANT_TIERS[number];

export const SettingsView: React.FC<SettingsViewProps> = ({
  apiKeys,
  clearApiKeys,
  gatewayUrls = {},
  updateGatewayUrl = () => {},
  sidebarOpen = true
}) => {
  const { refreshProviderQuota } = useTokenUsage();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showGateways, setShowGateways] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'workflow' | 'keys'>('workflow');
  const [expandedGuideProvider, setExpandedGuideProvider] = useState<string | null>(null);

  const [vaultStatus, setVaultStatus] = useState<Record<string, boolean>>({});
  const [keysInput, setKeysInput] = useState<Record<string, string>>({});
  const [workspacePath, setWorkspacePath] = useState<string>('');

  const [selectedQuant, setSelectedQuant] = useState<QuantTierId>(() => {
    return (localStorage.getItem('nyx_quant') as QuantTierId) || 'Q5_K_M';
  });

  const [cacheStats, setCacheStats] = useState<{
    itemCount: number;
    totalSizeBytes: number;
    hits: number;
    misses: number;
  }>({ itemCount: 0, totalSizeBytes: 0, hits: 0, misses: 0 });

  const [evolvedRules, setEvolvedRules] = useState<Array<{
    metric: string;
    critique: string;
    rule: string;
    timestamp: number;
  }>>([]);

  const fetchWorkspacePath = async () => {
    try {
      const res = await fetchWithAuth('/api/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspacePath(data.workspace);
      }
    } catch (e) {
      console.error('Failed to fetch workspace path:', e);
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

  const fetchCacheStats = async () => {
    try {
      const res = await fetchWithAuth('/api/cache/stats');
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
      const res = await fetchWithAuth('/api/nyx/rules');
      if (res.ok) {
        const data = await res.json();
        setEvolvedRules(data.rules || data || []);
      }
    } catch (e) {
      console.error('Failed to fetch evolved rules:', e);
    }
  };

  useEffect(() => {
    fetchCacheStats();
    fetchEvolvedRules();
    fetchVaultStatus();
    fetchWorkspacePath();
  }, []);

  useEffect(() => {
    ['gemini'].forEach(provider => {
      if (vaultStatus[provider]) {
        refreshProviderQuota(provider);
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
        <header className={`flex items-center justify-between p-4 ${!sidebarOpen ? 'pl-14' : ''} border-b border-white/[0.04] shrink-0 select-none bg-zinc-950 backdrop-blur-md transition-all duration-300`}>
          <div className="flex items-center gap-2">
            <SettingsIcon size={16} className="text-[#FF3366]" />
            <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">Settings</h2>
          </div>

          <button
            onClick={() => setShowGateways(!showGateways)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              showGateways 
                ? 'bg-[#FF3366]/20 text-[#FF3366] border border-[#FF3366]/30' 
                : 'bg-white/5 text-muted-foreground border border-white/5 hover:border-[#FF3366]/30'
            }`}
          >
            <Network size={12} />
            Gateways
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-xl mx-auto space-y-4 pb-12">
            <ApiKeyVault
              apiKeys={apiKeys}
              vaultStatus={vaultStatus}
              keysInput={keysInput}
              setKeysInput={setKeysInput}
              expandedProvider={expandedProvider}
              toggleExpanded={toggleExpanded}
              showGateways={showGateways}
              gatewayUrls={gatewayUrls}
              updateGatewayUrl={updateGatewayUrl}
              fetchVaultStatus={fetchVaultStatus}
              clearApiKeys={clearApiKeys}
            />

            <ModelSettingsSection
              selectedQuant={selectedQuant}
              setSelectedQuant={setSelectedQuant}
            />

            <CacheClean
              cacheStats={cacheStats}
              fetchCacheStats={fetchCacheStats}
            />

            <EvolutionaryRules
              evolvedRules={evolvedRules}
              setEvolvedRules={setEvolvedRules}
            />

            <WorkspaceConfig
              workspacePath={workspacePath}
              setWorkspacePath={setWorkspacePath}
            />

            {/* Learning Hub: App Workflow & Free Keys Guide */}
            <div className="mt-6 group p-5 rounded-3xl bg-card border border-white/[0.04] hover:border-[#FF3366]/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#FF3366]/20 via-[#FF3366]/10 to-[#FF3366]/20 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FF3366]">LEARNING & CREDENTIALS HUB</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Walkthrough & Free API Keys</h3>
                </div>
                
                <div className="flex bg-white/5 dark:bg-zinc-900/40 p-0.5 rounded-full border border-white/5">
                  <button
                    onClick={() => setActiveGuideTab('workflow')}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'workflow'
                        ? 'bg-[#FF3366] text-black shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Workflow
                  </button>
                  <button
                    onClick={() => setActiveGuideTab('keys')}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'keys'
                        ? 'bg-[#FF3366] text-black shadow-sm'
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
                        <div className="p-1 rounded-lg bg-[#FF3366]/10 text-[#FF3366]">
                          <Zap size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">1. Pipeline</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Vite frontend connects to the local Express gateway (Port 3010). Streaming requests proxy directly to a Fastify stream engine (Port 3011).
                      </p>
                    </div>

                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-[#FF3366]/10 text-[#FF3366]">
                          <Cpu size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">2. Sockets</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Fastify disables TCP buffering (Nagle's Algorithm), utilizes pre-warmed DNS lookups, and leverages persistent socket connection pooling.
                      </p>
                    </div>

                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-[#FF3366]/10 text-[#FF3366]">
                          <Database size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">3. Cache</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Every request maps to a SHA-256 signature capturing prompt, model parameters, and settings. Cached answers load instantly from disk.
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-background/60 border border-white/[0.04] rounded-2xl p-3.5 flex flex-col gap-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">Features Walkthrough</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground/90">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#FF3366] shrink-0" />
                        <span><strong>Compare Workspace</strong>: Benchmark model outputs side-by-side.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#FF3366] shrink-0" />
                        <span><strong>Performance Evaluation</strong>: Evaluate reasoning, response depth, & code.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#FF3366] shrink-0" />
                        <span><strong>Agent Workspace</strong>: Specialized editor with multiline code playground.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#FF3366] shrink-0" />
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
                          <div className="w-4 h-4 rounded-full bg-[#FF3366]/10 text-[#FF3366] flex items-center justify-center text-[10px] font-black">G</div>
                          <span className="text-[10px] font-bold text-foreground">Google Gemini API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Tier</span>
                        </div>
                        {expandedGuideProvider === 'gemini' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'gemini' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>Google offers robust free tiers for Google Gemini keys directly within Google AI Studio, granting developers massive rate limits at no cost.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Go to the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-[#FF3366] hover:underline font-bold inline-flex items-center gap-0.5">Google AI Studio Console <ExternalLink size={8} /></a>.</li>
                            <li>Log in with any Google account.</li>
                            <li>Click the prominent <strong>"Get API Key"</strong> or <strong>"Create API Key"</strong> button on the sidebar.</li>
                            <li>Select <strong>"Create API key in new project"</strong>.</li>
                            <li>Copy the generated key (starts with <code>AIzaSy...</code>) and paste it into the <strong>Google Gemini</strong> key field on this settings page.</li>
                          </ol>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
