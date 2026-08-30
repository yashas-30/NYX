/**
 * @file src/hooks/useDashboardState.ts
 * @description Monolithic state hook refactored to manage state for AppDashboard, registry, and settings.
 * NYX is the sole agent — no Coder agent switching.
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';

import { useLocalModels } from '@src/shared/hooks/useLocalModels';

// Modular Hooks
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useProviderStatus } from './useProviderStatus';

export const useDashboardState = (onExit?: () => void) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeMode = (() => {
    const path = location.pathname;
    if (path === '/chat') return 'chat';
    if (path === '/models') return 'registry';
    if (path === '/settings') return 'settings';
    if (path === '/compare') return 'compare';
    return 'chat';
  })();

  const setActiveMode = (mode: 'settings' | 'registry' | 'chat' | 'compare') => {
    if (mode === 'chat') navigate('/chat');
    else if (mode === 'registry') navigate('/models');
    else if (mode === 'settings') navigate('/settings');
    else if (mode === 'compare') navigate('/compare');
    else navigate('/chat');
  };

  const [models, setModels] = useState<Record<'chat', string>>({
    chat: '',
  });

  const { usage, updateUsage: trackUsage, refreshProviderQuota } = useTokenUsage();

  const [localModelsEnabled, setLocalModelsEnabled] = useState(false);
  const localModelsQuery = useLocalModels(localModelsEnabled);
  const localLibraryModels = [...(localModelsQuery.data?.models || [])];

  // 2. Security & API Keys from Zustand store
  const apiKeys = useNyxStore((state) => state.apiKeys);
  const updateApiKey = useNyxStore((state) => state.updateApiKey);
  const clearApiKeys = useNyxStore((state) => state.clearApiKeys);
  const [gatewayUrls, setGatewayUrls] = useState<Record<string, string>>({});
  const updateGatewayUrl = (provider: string, url: string) => {
    setGatewayUrls((prev) => ({ ...prev, [provider]: url }));
  };

  // 3. Provider Connectivity Status
  const { statuses, refreshStatuses } = useProviderStatus(apiKeys, localModelsEnabled);

  // ── Initialization Logic ───────────────────────────────────────────────
  useEffect(() => {
    // Register global mode switch helper
    (window as any).nyxSwitchActiveMode = (mode: 'settings' | 'registry' | 'chat' | 'compare') => {
      setActiveMode(mode);
    };

    // Purge old localStorage keys to ensure compliance with vault policy
    localStorage.removeItem('llm_ref_api_keys');
    localStorage.removeItem('llm_ref_api_key');
    localStorage.removeItem('nyx_coder_settings');

    const savedModels = localStorage.getItem('nyx_chat_models');
    const savedLocalModelsEnabled = localStorage.getItem('llm_ref_local_models_enabled');
    if (savedLocalModelsEnabled !== null) {
      setLocalModelsEnabled(savedLocalModelsEnabled === 'true');
    }

    if (savedModels) {
      try {
        const parsed = JSON.parse(savedModels);
        setModels({
          chat: parsed.chat || '',
        });
      } catch (e: any) {
        console.error('Models load fail', e);
      }
    } else {
      // Migrate from old state if exists
      const oldModels = localStorage.getItem('nyx_coder_models_v3');
      if (oldModels) {
        try {
          const parsed = JSON.parse(oldModels);
          setModels({
            chat: parsed.chat || parsed.coder || '',
          });
        } catch {}
      }
    }

    // Load keys from secure safeStorage vault via Tauri invoke on mount
    useNyxStore.getState().loadSecureKeys();

    return () => {
      delete (window as any).nyxSwitchActiveMode;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Side Effects (Persistence & Lifecycle) ─────────────────────────────
  useEffect(() => {
    // Only refresh quota for providers that actually have keys (performance fix)
    Object.entries(apiKeys).forEach(([p, k]) => {
      if (k) refreshProviderQuota(p, k);
    });
    refreshStatuses();
  }, [apiKeys, refreshProviderQuota]);

  useEffect(() => {
    localStorage.setItem('llm_ref_local_models_enabled', String(localModelsEnabled));
    refreshStatuses();
  }, [localModelsEnabled]);

  useEffect(() => {
    localStorage.setItem('nyx_chat_models', JSON.stringify(models));
  }, [models]);

  const setModel = (mid: string) => {
    setModels((prev) => ({
      ...prev,
      chat: mid,
    }));
  };

  return {
    // Top-level State
    activeMode,
    setActiveMode,
    apiKeys,
    onExit,

    models: { nyx: models.chat } as Record<'nyx', string>,
    modelsState: models,
    setModels,
    setModel,

    // Registry (simplified)
    localModelsEnabled,
    setLocalModelsEnabled,
    localLibraryModels,

    // Security
    updateApiKey,
    clearApiKeys,
    gatewayUrls,
    updateGatewayUrl,

    // Connectivity
    statuses,
    refreshStatuses: async () => {
      await refreshStatuses();
      await localModelsQuery.refetch();
    },

    // Shared usage tracker for features
    trackUsage,
  };
};
