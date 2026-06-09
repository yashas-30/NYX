import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Network,
  HelpCircle,
  BookOpen,
  ExternalLink,
  Cpu,
  Zap,
  Database,
  Globe,
  Settings as SettingsIcon,
  ChevronUp,
  ChevronDown,
  Search,
  User,
  Palette,
} from 'lucide-react';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

import { ApiKeyVault } from './ApiKeyVault';
import { WorkspaceConfig } from './WorkspaceConfig';
import { ModelSettingsSection } from './ModelSettingsSection';
import { EvolutionaryRules } from './EvolutionaryRules';
import { CacheClean } from './CacheClean';
import { HotkeyManager } from './HotkeyManager';
import { NetworkSettings } from './NetworkSettings';
import { AuditLogView } from './AuditLogView';
import { SettingsSyncService } from '../SettingsSyncService';
import { AccessibilityChecker } from '../AccessibilityChecker';

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
type QuantTierId = (typeof QUANT_TIERS)[number];

export const SettingsView: React.FC<SettingsViewProps> = ({
  apiKeys,
  clearApiKeys,
  gatewayUrls = {},
  updateGatewayUrl = () => {},
  sidebarOpen = true,
}) => {
  const { refreshProviderQuota } = useTokenUsage();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showGateways, setShowGateways] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'workflow' | 'keys'>('workflow');
  const [expandedGuideProvider, setExpandedGuideProvider] = useState<string | null>(null);

  const [vaultStatus, setVaultStatus] = useState<Record<string, boolean>>({});
  const [keysInput, setKeysInput] = useState<Record<string, string>>({});
  const [workspacePath, setWorkspacePath] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeProfile, setActiveProfile] = useState('default');

  const [selectedQuant, setSelectedQuant] = useState<QuantTierId>(() => {
    return (localStorage.getItem('nyx_quant') as QuantTierId) || 'Q5_K_M';
  });

  const [cacheStats, setCacheStats] = useState<{
    itemCount: number;
    totalSizeBytes: number;
    hits: number;
    misses: number;
  }>({ itemCount: 0, totalSizeBytes: 0, hits: 0, misses: 0 });

  const [evolvedRules, setEvolvedRules] = useState<
    Array<{
      metric: string;
      critique: string;
      rule: string;
      timestamp: number;
    }>
  >([]);

  const [activeTab, setActiveTab] = useState<string>('api-keys');

  const fetchWorkspacePath = async () => {
    try {
      const res = await fetchWithAuth('/api/v1/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspacePath(data.workspace);
      }
    } catch (e: any) {
      console.error('Failed to fetch workspace path:', e);
    }
  };

  const fetchVaultStatus = async () => {
    try {
      const res = await fetch('/api/v1/vault/status');
      if (res.ok) {
        const data = await res.json();
        setVaultStatus(data);
      }
    } catch (e: any) {
      console.error('Failed to fetch vault status:', e);
    }
  };

  const fetchCacheStats = async () => {
    try {
      const res = await fetchWithAuth('/api/v1/cache/stats');
      if (res.ok) {
        const data = await res.json();
        setCacheStats(data);
      }
    } catch (e: any) {
      console.error('Failed to fetch cache stats:', e);
    }
  };

  const fetchEvolvedRules = async () => {
    try {
      const res = await fetchWithAuth('/api/v1/nyx/rules');
      if (res.ok) {
        const data = await res.json();
        setEvolvedRules(Array.isArray(data.rules) ? data.rules : (Array.isArray(data) ? data : []));
      }
    } catch (e: any) {
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
    ['gemini'].forEach((provider) => {
      if (vaultStatus[provider]) {
        refreshProviderQuota(provider);
      }
    });
  }, [vaultStatus, refreshProviderQuota]);


  const toggleExpanded = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
  };

  const TABS = [
    { id: 'api-keys', label: 'API Keys', icon: <Database size={14} /> },
    { id: 'models', label: 'Models & Cache', icon: <Cpu size={14} /> },
    { id: 'network', label: 'Network', icon: <Network size={14} /> },
    { id: 'advanced', label: 'Advanced', icon: <SettingsIcon size={14} /> },
    { id: 'backup', label: 'Backup & Sync', icon: <Database size={14} /> },
    { id: 'guide', label: 'Learning Hub', icon: <BookOpen size={14} /> },
  ];

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden bg-background"
    >
      <header
        className={`h-14 flex items-center justify-between px-6 ${!sidebarOpen ? 'pl-14' : ''} border-b border-border shrink-0 select-none bg-card transition-all duration-300 gap-6`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <SettingsIcon size={16} className="text-primary" />
          <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">Settings</h2>
        </div>

        <div className="relative flex-1 max-w-md hidden sm:block">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={14}
          />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-md pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-1.5">
            <User size={14} className="text-muted-foreground" />
            <select
              value={activeProfile}
              onChange={(e) => setActiveProfile(e.target.value)}
              className="bg-transparent text-xs text-foreground focus:outline-none appearance-none cursor-pointer"
            >
              <option value="default" className="bg-card">
                Default Profile
              </option>
              <option value="fast-coding" className="bg-card">
                Fast Coding
              </option>
              <option value="deep-research" className="bg-card">
                Deep Research
              </option>
            </select>
          </div>


          <button
            onClick={() => setShowGateways(!showGateways)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              showGateways
                ? 'bg-muted text-foreground border border-border'
                : 'bg-transparent text-muted-foreground border border-border hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <Network size={12} />
            Gateways
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Settings Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-border bg-card p-4 overflow-y-auto custom-scrollbar flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <div className={activeTab === tab.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}>
                {tab.icon}
              </div>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 bg-background">
          <div className="max-w-3xl mx-auto space-y-6 pb-12">
            {activeTab === 'api-keys' && (
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
            )}

            {activeTab === 'models' && (
              <div className="space-y-6">
                <ModelSettingsSection
                  selectedQuant={selectedQuant}
                  setSelectedQuant={setSelectedQuant}
                />
                <CacheClean cacheStats={cacheStats} fetchCacheStats={fetchCacheStats} />
              </div>
            )}

            {activeTab === 'network' && (
              <NetworkSettings />
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-6">
                <WorkspaceConfig workspacePath={workspacePath} setWorkspacePath={setWorkspacePath} />
                <HotkeyManager />
                <EvolutionaryRules evolvedRules={evolvedRules} setEvolvedRules={setEvolvedRules} />
                <AuditLogView />
              </div>
            )}

            {activeTab === 'backup' && (
              <div className="p-6 border border-border rounded-lg bg-card">
                <h3 className="text-sm font-bold text-foreground mb-4 font-serif">Cloud Sync & Backup</h3>
                <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                  Export your current settings configuration to a JSON file, or import an existing configuration to restore your previous setup.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => SettingsSyncService.exportSettings()}
                    className="flex-1 py-2.5 rounded-md bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                  >
                    Export Settings
                  </button>
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'application/json';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const success = await SettingsSyncService.importSettings(file);
                          if (success) toast.success('Settings imported successfully.');
                        }
                      };
                      input.click();
                    }}
                    className="flex-1 py-2.5 rounded-md bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                  >
                    Import Settings
                  </button>
                  <button
                    onClick={async () => {
                      const success = await SettingsSyncService.importFromVSCode();
                      if (success) toast.success('VS Code Settings imported successfully.');
                    }}
                    className="flex-1 py-2.5 rounded-md bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
                  >
                    Import from VS Code
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'guide' && (
              <div className="group p-6 rounded-lg bg-card border border-border hover:border-accent/40 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 opacity-70 group-hover:opacity-100 transition-opacity" />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-border pb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
                      LEARNING & CREDENTIALS HUB
                    </p>
                    <h3 className="text-sm font-bold text-foreground mt-1 font-serif">
                      Walkthrough & Free API Keys
                    </h3>
                  </div>

                  <div className="flex bg-secondary p-1 rounded-md border border-border">
                    <button
                      onClick={() => setActiveGuideTab('workflow')}
                      className={`px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        activeGuideTab === 'workflow'
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                      }`}
                    >
                      Workflow
                    </button>
                    <button
                      onClick={() => setActiveGuideTab('keys')}
                      className={`px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        activeGuideTab === 'keys'
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                      }`}
                    >
                      Free Keys
                    </button>
                  </div>
                </div>

                {activeGuideTab === 'workflow' ? (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      NYX is a premium, high-fidelity AI coding environment and runner that executes powerful local models locally on your GPU and orchestrates cloud LLMs. Here is how your requests are routed:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-background/40 border border-border rounded-lg p-4 flex flex-col gap-3 hover:bg-background/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-accent/10 text-accent">
                            <Zap size={14} />
                          </div>
                          <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                            1. Pipeline
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Vite frontend connects to the local Express gateway (Port 3000). Streaming
                          requests proxy directly to a Fastify stream engine (Port 3001).
                        </p>
                      </div>

                      <div className="bg-background/40 border border-border rounded-lg p-4 flex flex-col gap-3 hover:bg-background/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-accent/10 text-accent">
                            <Cpu size={14} />
                          </div>
                          <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                            2. Sockets
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Fastify disables TCP buffering (Nagle's Algorithm), utilizes pre-warmed DNS
                          lookups, and leverages persistent socket connection pooling.
                        </p>
                      </div>

                      <div className="bg-background/40 border border-border rounded-lg p-4 flex flex-col gap-3 hover:bg-background/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-accent/10 text-accent">
                            <Database size={14} />
                          </div>
                          <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                            3. Cache
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Every request maps to a SHA-256 signature capturing prompt, model
                          parameters, and settings. Cached answers load instantly from disk.
                        </p>
                      </div>
                    </div>

                    <div className="bg-background border border-border rounded-lg p-5 flex flex-col gap-3 mt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                        Features Walkthrough
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[11px] text-muted-foreground">
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />
                          <span>
                            <strong className="text-foreground">Local GGUF Models</strong>: Run Llama 3, Qwen, Gemma, Mistral, Phi, DeepSeek on your GPU via built-in llama-server.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />
                          <span>
                            <strong className="text-foreground">NYX Agent Pipeline</strong>: Planner → SubagentSwarm → Optimizer pipeline for code implementation.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />
                          <span>
                            <strong className="text-foreground">100% Local Keys</strong>: API keys stay in your browser's localStorage — never sent to a database.
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />
                          <span>
                            <strong className="text-foreground">Cloud Orchestration</strong>: Seamlessly switch between local models and cloud providers like Gemini.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Acquire free developer API keys to start using NYX at zero cost. Follow the
                      step-by-step instructions below for each provider:
                    </p>

                    <div className="space-y-3">
                      {/* Google Gemini Key */}
                      <div className="border border-border rounded-lg overflow-hidden bg-background/40 hover:bg-background/60 transition-all">
                        <button
                          onClick={() =>
                            setExpandedGuideProvider(
                              expandedGuideProvider === 'gemini' ? null : 'gemini'
                            )
                          }
                          className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-md bg-accent/10 text-accent flex items-center justify-center text-xs font-black">
                              G
                            </div>
                            <span className="text-xs font-bold text-foreground">
                              Google Gemini API
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                              Free Tier
                            </span>
                          </div>
                          {expandedGuideProvider === 'gemini' ? (
                            <ChevronUp size={14} className="text-muted-foreground" />
                          ) : (
                            <ChevronDown size={14} className="text-muted-foreground" />
                          )}
                        </button>

                        {expandedGuideProvider === 'gemini' && (
                          <div className="px-4 pb-4 pt-2 border-t border-border text-[11px] text-muted-foreground space-y-3 leading-relaxed">
                            <p>
                              Google offers robust free tiers for Google Gemini keys directly within
                              Google AI Studio, granting developers massive rate limits at no cost.
                            </p>
                            <ol className="list-decimal pl-5 space-y-1.5">
                              <li>
                                Go to the{' '}
                                <a
                                  href="https://aistudio.google.com/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:underline font-bold inline-flex items-center gap-1"
                                >
                                  Google AI Studio Console <ExternalLink size={10} />
                                </a>
                                .
                              </li>
                              <li>Log in with any Google account.</li>
                              <li>
                                Click the prominent <strong>"Get API Key"</strong> or{' '}
                                <strong>"Create API Key"</strong> button on the sidebar.
                              </li>
                              <li>
                                Select <strong>"Create API key in new project"</strong>.
                              </li>
                              <li>
                                Copy the generated key (starts with <code>AIzaSy...</code>) and paste
                                it into the <strong>Google Gemini</strong> key field on this settings
                                page.
                              </li>
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
