import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
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
  const [activeTheme, setActiveTheme] = useState('dark');

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
        setEvolvedRules(data.rules || data || []);
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

  useEffect(() => {
    AccessibilityChecker.runCheck(activeTheme);
  }, [activeTheme]);

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
        <header
          className={`flex items-center justify-between p-4 ${!sidebarOpen ? 'pl-14' : ''} border-b border-white/[0.04] shrink-0 select-none bg-zinc-950 backdrop-blur-md transition-all duration-300`}
        >
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

        {/* Global Settings Toolbar */}
        <div className="px-6 py-4 border-b border-white/[0.04] bg-white/[0.01] flex flex-wrap items-center gap-4 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-white/[0.05] rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-[#FF3366]/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-1.5">
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
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-1.5">
              <Palette size={14} className="text-muted-foreground" />
              <select
                value={activeTheme}
                onChange={(e) => setActiveTheme(e.target.value)}
                className="bg-transparent text-xs text-foreground focus:outline-none appearance-none cursor-pointer"
              >
                <option value="dark" className="bg-card">
                  Dark Theme
                </option>
                <option value="light" className="bg-card">
                  Light Theme
                </option>
                <option value="high-contrast" className="bg-card">
                  High Contrast
                </option>
              </select>
            </div>
          </div>
        </div>

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

            <CacheClean cacheStats={cacheStats} fetchCacheStats={fetchCacheStats} />

            <EvolutionaryRules evolvedRules={evolvedRules} setEvolvedRules={setEvolvedRules} />

            <HotkeyManager />
            <NetworkSettings />
            <AuditLogView />

            <WorkspaceConfig workspacePath={workspacePath} setWorkspacePath={setWorkspacePath} />

            {/* Cloud Sync & Backup Actions */}
            <div className="mt-6 flex gap-3 pb-6">
              <button
                onClick={() => SettingsSyncService.exportSettings()}
                className="flex-1 py-2 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
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
                className="flex-1 py-2 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
              >
                Import Settings
              </button>
              <button
                onClick={async () => {
                  const success = await SettingsSyncService.importFromVSCode();
                  if (success) toast.success('VS Code Settings imported successfully.');
                }}
                className="flex-1 py-2 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors"
              >
                Import from VS Code
              </button>
            </div>

            {/* Learning Hub: App Workflow & Free Keys Guide */}
            <div className="mt-6 group p-5 rounded-3xl bg-card border border-border hover:border-accent/40 transition-all duration-300 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 opacity-70 group-hover:opacity-100 transition-opacity" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-border pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
                    LEARNING & CREDENTIALS HUB
                  </p>
                  <h3 className="text-xs font-bold text-foreground mt-0.5">
                    Walkthrough & Free API Keys
                  </h3>
                </div>

                <div className="flex bg-secondary p-0.5 rounded-full border border-border">
                  <button
                    onClick={() => setActiveGuideTab('workflow')}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'workflow'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Workflow
                  </button>
                  <button
                    onClick={() => setActiveGuideTab('keys')}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeGuideTab === 'keys'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Free Keys
                  </button>
                </div>
              </div>

              {activeGuideTab === 'workflow' ? (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    NYX runs on a high-speed, dual-server framework designed for side-by-side LLM
                    comparisons, prompt engineering, and offline local development. Here is how your
                    requests are routed:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-background/40 border border-border rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-background/60 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-accent/10 text-accent">
                          <Zap size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                          1. Pipeline
                        </h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Vite frontend connects to the local Express gateway (Port 3010). Streaming
                        requests proxy directly to a Fastify stream engine (Port 3011).
                      </p>
                    </div>

                    <div className="bg-background/40 border border-border rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-background/60 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-accent/10 text-accent">
                          <Cpu size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                          2. Sockets
                        </h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Fastify disables TCP buffering (Nagle's Algorithm), utilizes pre-warmed DNS
                        lookups, and leverages persistent socket connection pooling.
                      </p>
                    </div>

                    <div className="bg-background/40 border border-border rounded-2xl p-3.5 flex flex-col gap-2 hover:bg-background/60 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-accent/10 text-accent">
                          <Database size={12} />
                        </div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                          3. Cache
                        </h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Every request maps to a SHA-256 signature capturing prompt, model
                        parameters, and settings. Cached answers load instantly from disk.
                      </p>
                    </div>
                  </div>

                  <div className="bg-background border border-border rounded-2xl p-3.5 flex flex-col gap-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                      Features Walkthrough
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-accent shrink-0" />
                        <span>
                          <strong>Compare Workspace</strong>: Benchmark model outputs side-by-side.
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-accent shrink-0" />
                        <span>
                          <strong>Performance Evaluation</strong>: Evaluate reasoning, response
                          depth, & code.
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-accent shrink-0" />
                        <span>
                          <strong>Agent Workspace</strong>: Specialized editor with multiline code
                          playground.
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-accent shrink-0" />
                        <span>
                          <strong>Model Registry</strong>: Manage model configurations & discover
                          local instances.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Acquire free developer API keys to start using NYX at zero cost. Follow the
                    step-by-step instructions below for each provider:
                  </p>

                  <div className="space-y-2">
                    {/* Google Gemini Key */}
                    <div className="border border-border rounded-xl overflow-hidden bg-background/40 hover:bg-background/60 transition-all">
                      <button
                        onClick={() =>
                          setExpandedGuideProvider(
                            expandedGuideProvider === 'gemini' ? null : 'gemini'
                          )
                        }
                        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-black">
                            G
                          </div>
                          <span className="text-[10px] font-bold text-foreground">
                            Google Gemini API
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                            Free Tier
                          </span>
                        </div>
                        {expandedGuideProvider === 'gemini' ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )}
                      </button>

                      {expandedGuideProvider === 'gemini' && (
                        <div className="px-3 pb-3 pt-1 border-t border-border text-[11px] text-muted-foreground space-y-2 leading-relaxed">
                          <p>
                            Google offers robust free tiers for Google Gemini keys directly within
                            Google AI Studio, granting developers massive rate limits at no cost.
                          </p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>
                              Go to the{' '}
                              <a
                                href="https://aistudio.google.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline font-bold inline-flex items-center gap-0.5"
                              >
                                Google AI Studio Console <ExternalLink size={8} />
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
          </div>
        </div>
      </div>
    </motion.div>
  );
};
