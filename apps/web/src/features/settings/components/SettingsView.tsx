import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { BookOpenIcon as BookOpen, ExternalLinkIcon as ExternalLink, ZapIcon as Zap, GlobeIcon as Globe, SettingsIcon as SettingsIcon, ChevronUpIcon as ChevronUp, ChevronDownIcon as ChevronDown, SearchIcon as Search, UserIcon as User } from '@animateicons/react/lucide';
import { Network, HelpCircle, Cpu, Database, Palette } from 'lucide-react';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';


import { ApiKeyVault } from './ApiKeyVault';
import { ModelSettingsSection } from './ModelSettingsSection';
import { CacheClean } from './CacheClean';
import { SearchSettingsSection } from './SearchSettingsSection';

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

  const [vaultStatus, setVaultStatus] = useState<Record<string, boolean>>({});
  const [keysInput, setKeysInput] = useState<Record<string, string>>({});

  const [selectedQuant, setSelectedQuant] = useState<QuantTierId>(() => {
    return (localStorage.getItem('nyx_quant') as QuantTierId) || 'Q5_K_M';
  });

  const [cacheStats, setCacheStats] = useState<{
    itemCount: number;
    totalSizeBytes: number;
    hits: number;
    misses: number;
  }>({ itemCount: 0, totalSizeBytes: 0, hits: 0, misses: 0 });

  const [activeTab, setActiveTab] = useState<string>('api-keys');

  const fetchVaultStatus = async () => {
    try {
      const res: any = await invoke('vault:status');
      if (res.success && res.data) {
        setVaultStatus(res.data);
      }
    } catch (e: any) {
      console.error('Failed to fetch vault status:', e);
    }
  };

  const fetchCacheStats = async () => {
    try {
      // In native Tauri mode, cache stats are either not applicable or handled differently.
      // Since the get_cache_stats endpoint doesn't exist yet in the Rust backend,
      // we set this to null instead of faking zeros.
      setCacheStats(null as any);
    } catch (err: any) {
      console.error('Failed to fetch cache stats:', err);
    }
  };

  useEffect(() => {
    fetchCacheStats();
    fetchVaultStatus();
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
    { id: 'search', label: 'Web Search', icon: <Globe size={14} /> },
  ];

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden bg-background"
    >
      {/* Settings header — tabs inline, no internal sidebar */}
      <header
        className={`h-10 flex items-center gap-6 px-6 ${!sidebarOpen ? 'pl-14' : ''} border-b border-border shrink-0 select-none bg-card transition-all duration-300`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <SettingsIcon size={14} className="text-primary" />
          <h2 className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Settings</h2>
        </div>

        {/* Horizontal tab pills */}
        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-primary' : 'text-muted-foreground/60'}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Full-width content area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-none bg-background">
        <div className="max-w-screen-xl mx-auto space-y-6 pb-12">
          {activeTab === 'api-keys' && (
            <ApiKeyVault
              apiKeys={apiKeys}
              vaultStatus={vaultStatus}
              keysInput={keysInput}
              setKeysInput={setKeysInput}
              expandedProvider={expandedProvider}
              toggleExpanded={toggleExpanded}
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

          {activeTab === 'search' && (
            <SearchSettingsSection />
          )}
        </div>
      </div>
    </motion.div>
  );
};
