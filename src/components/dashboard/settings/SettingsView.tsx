import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Network, HelpCircle, BookOpen, ExternalLink, Cpu, Zap, Database, Globe, Settings as SettingsIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { useTokenUsage } from '@src/context/TokenUsageContext';
import { toast } from '@src/components/ui/sonner';

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
      const res = await fetch('/api/workspace');
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

  useEffect(() => {
    fetchCacheStats();
    fetchEvolvedRules();
    fetchVaultStatus();
    fetchWorkspacePath();
  }, []);

  useEffect(() => {
    ['gemini', 'openrouter', 'nvidia', 'opencode'].forEach(provider => {
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
            <SettingsIcon size={16} className="text-[#22D3EE]" />
            <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">Settings</h2>
          </div>

          <button
            onClick={() => setShowGateways(!showGateways)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              showGateways 
                ? 'bg-[#22D3EE]/20 text-[#22D3EE] border border-[#22D3EE]/30' 
                : 'bg-white/5 text-muted-foreground border border-white/5 hover:border-[#22D3EE]/30'
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
            <div className="mt-6 group p-5 rounded-3xl bg-card border border-white/[0.04] hover:border-[#22D3EE]/25 transition-all duration-300 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#22D3EE]/20 via-[#22D3EE]/10 to-[#22D3EE]/20 opacity-70 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22D3EE]">LEARNING & CREDENTIALS HUB</p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">Walkthrough & Free API Keys</h3>
                </div>
                
                <div className="flex bg-white/5 dark:bg-zinc-900/40 p-0.5 rounded-full border border-white/5">
                  <button
                    onClick={() => setActiveGuideTab('workflow')}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'workflow'
                        ? 'bg-[#22D3EE] text-black shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Workflow
                  </button>
                  <button
                    onClick={() => setActiveGuideTab('keys')}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'keys'
                        ? 'bg-[#22D3EE] text-black shadow-sm'
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
                        <div className="p-1 rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
                          <Zap size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">1. Pipeline</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                        Vite frontend connects to the local Express gateway (Port 3000). Streaming requests proxy directly to a Fastify stream engine (Port 3001).
                      </p>
                    </div>

                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
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
                        <div className="p-1 rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
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
                        <div className="w-1 h-1 rounded-full bg-[#22D3EE] shrink-0" />
                        <span><strong>Compare Workspace</strong>: Benchmark model outputs side-by-side.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#22D3EE] shrink-0" />
                        <span><strong>Performance Evaluation</strong>: Evaluate reasoning, response depth, & code.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#22D3EE] shrink-0" />
                        <span><strong>Agent Workspace</strong>: Specialized editor with multiline code playground.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#22D3EE] shrink-0" />
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
                          <div className="w-4 h-4 rounded-full bg-[#22D3EE]/10 text-[#22D3EE] flex items-center justify-center text-[10px] font-black">G</div>
                          <span className="text-[10px] font-bold text-foreground">Google Gemini API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Tier</span>
                        </div>
                        {expandedGuideProvider === 'gemini' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'gemini' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>Google offers robust free tiers for Google Gemini keys directly within Google AI Studio, granting developers massive rate limits at no cost.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Go to the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:underline font-bold inline-flex items-center gap-0.5">Google AI Studio Console <ExternalLink size={8} /></a>.</li>
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
                          <div className="w-4 h-4 rounded-full bg-[#22D3EE]/10 text-[#22D3EE] flex items-center justify-center text-[10px] font-black">O</div>
                          <span className="text-[10px] font-bold text-foreground">OpenRouter API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Models</span>
                        </div>
                        {expandedGuideProvider === 'openrouter' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'openrouter' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>OpenRouter is an aggregator offering low-latency API access. Creating an account gives you instant access to multiple entirely free LLMs.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Visit the <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:underline font-bold inline-flex items-center gap-0.5">OpenRouter Website <ExternalLink size={8} /></a>.</li>
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
                          <div className="w-4 h-4 rounded-full bg-[#22D3EE]/10 text-[#22D3EE] flex items-center justify-center text-[10px] font-black">N</div>
                          <span className="text-[10px] font-bold text-foreground">NVIDIA NIM API</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Credits</span>
                        </div>
                        {expandedGuideProvider === 'nvidia' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'nvidia' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>NVIDIA Developer Program equips developers with 1,000 free inference credits to benchmark state-of-the-art hosted models.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Navigate to the <a href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:underline font-bold inline-flex items-center gap-0.5">NVIDIA NGC Catalog <ExternalLink size={8} /></a>.</li>
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
                          <div className="w-4 h-4 rounded-full bg-[#22D3EE]/10 text-[#22D3EE] flex items-center justify-center text-[10px] font-black">C</div>
                          <span className="text-[10px] font-bold text-foreground">OpenCode Zen</span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">Free Sandbox</span>
                        </div>
                        {expandedGuideProvider === 'opencode' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      
                      {expandedGuideProvider === 'opencode' && (
                        <div className="px-3 pb-3 pt-1 border-t border-white/10 text-[11px] text-muted-foreground/90 space-y-2 leading-relaxed">
                          <p>OpenCode Zen provides optimized developer sandbox keys to connect with code-specialized AI reasoning models.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Visit the <a href="https://opencode.ai/" target="_blank" rel="noopener noreferrer" className="text-[#22D3EE] hover:underline font-bold inline-flex items-center gap-0.5">OpenCode Portal <ExternalLink size={8} /></a>.</li>
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
          </div>
        </div>
      </div>
    </motion.div>
  );
};
