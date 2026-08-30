import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { SettingsIcon } from '@animateicons/react/lucide';
import { KeyRound } from 'lucide-react';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { ApiKeyVault } from './ApiKeyVault';

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

export const SettingsView: React.FC<SettingsViewProps> = ({
  apiKeys,
  clearApiKeys,
  sidebarOpen = true,
}) => {
  const { refreshProviderQuota } = useTokenUsage();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<Record<string, boolean>>({});
  const [keysInput, setKeysInput] = useState<Record<string, string>>({});

  const fetchVaultStatus = async () => {
    try {
      const res: any = await invoke('vault:status');
      if (res && res.success && res.data) {
        setVaultStatus(res.data);
      }
    } catch (e: any) {
      console.error('Failed to fetch vault status:', e);
    }
  };

  useEffect(() => {
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
    setExpandedProvider((prev) => (prev === providerId ? null : providerId));
  };

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.05 }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden bg-background"
    >
      {/* Settings header */}
      <header
        className={`h-10 flex items-center justify-between px-6 ${!sidebarOpen ? 'pl-14' : ''} border-b border-border shrink-0 select-none bg-card transition-all duration-300`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <SettingsIcon size={14} className="text-primary" />
          <h2 className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Settings <span className="text-muted-foreground/40 font-normal">/</span> API Key Vault &
            Model Providers
          </h2>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-accent/5 border border-accent/15 text-[10px] font-mono text-accent">
          <KeyRound size={11} />
          <span>Device Secured Vault</span>
        </div>
      </header>

      {/* Full-width content area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-none bg-background">
        <div className="max-w-screen-xl mx-auto space-y-6 pb-12">
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
        </div>
      </div>
    </motion.div>
  );
};
