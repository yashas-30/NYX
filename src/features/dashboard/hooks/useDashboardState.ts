/**
 * @file src/hooks/useDashboardState.ts
 * @description Monolithic state hook refactored to manage state for CoderDashboard, registry, and settings.
 * NYX is the sole agent — no Claude agent switching.
 */

import { useState, useEffect } from 'react';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

// Modular Hooks
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useProviderStatus } from './useProviderStatus';

export const useDashboardState = (onExit?: () => void) => {
  const [activeMode, setActiveMode] = useState<'settings' | 'registry' | 'coder' | 'chat'>('coder');
  const [modelSettings, setModelSettings] = useState(() => {
    const saved = localStorage.getItem('nyx_model_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          temperature: 0.7,
          maxTokens: 16384,
          topP: 0.95,
          topK: 40,
          gpuLayers: 99,
          threads: 4,
          contextSize: 2048,
          batchSize: 512,
          repeatPenalty: 1.1,
          mirostat: 0,
          ...parsed,
        };
      } catch {}
    }
    return {
      temperature: 0.7,
      maxTokens: 16384,
      topP: 0.95,
      topK: 40,
      gpuLayers: 99,
      threads: 4,
      contextSize: 2048,
      batchSize: 512,
      repeatPenalty: 1.1,
      mirostat: 0,
    };
  });

  // Split models for conversational general chat ('chat') and coding ('coder')
  const [models, setModels] = useState<Record<'chat' | 'coder', string>>({
    chat: '',
    coder: '',
  });

  const { usage, updateUsage: trackUsage, refreshProviderQuota } = useTokenUsage();

  const [localModelsEnabled, setLocalModelsEnabled] = useState(false);
  const [localLibraryModels, setLocalLibraryModels] = useState<any[]>([]);

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
    (window as any).nyxSwitchActiveMode = (mode: 'settings' | 'registry' | 'coder' | 'chat') => {
      setActiveMode(mode);
    };

    // Purge old localStorage keys to ensure compliance with vault policy
    localStorage.removeItem('llm_ref_api_keys');
    localStorage.removeItem('llm_ref_api_key');

    const savedModels = localStorage.getItem('nyx_coder_models_v3');
    const savedLocalModelsEnabled = localStorage.getItem('llm_ref_local_models_enabled');
    if (savedLocalModelsEnabled !== null) {
      setLocalModelsEnabled(savedLocalModelsEnabled === 'true');
    }

    if (savedModels) {
      try {
        const parsed = JSON.parse(savedModels);
        setModels({
          chat: parsed.chat || '',
          coder: parsed.coder || '',
        });
      } catch (e: any) {
        console.error('Models load fail', e);
      }
    } else {
      // Migrate from old state if exists
      const oldModels = localStorage.getItem('nyx_coder_models_v2');
      if (oldModels) {
        try {
          const parsed = JSON.parse(oldModels);
          const legacyModel = parsed.nyx || '';
          setModels({
            chat: legacyModel,
            coder: legacyModel,
          });
        } catch {}
      }
    }

    // Load keys from secure safeStorage vault via Native IPC on mount
    const loadSecureKeys = async () => {
      if (typeof window !== 'undefined' && (window as any).nyxIPC) {
        const ipc = (window as any).nyxIPC;
        try {
          const listRes = await ipc.invoke('vault:list-keys');
          if (listRes.success && Array.isArray(listRes.data)) {
            const keys: Record<string, string> = {};
            for (const provider of listRes.data) {
              const getRes = await ipc.invoke('vault:get-key', { provider });
              if (getRes.success && getRes.data) {
                keys[provider] = getRes.data;
              }
            }
            useNyxStore.getState().setApiKeys(keys);
          }
        } catch (err: any) {
          console.error('[Vault] Failed to retrieve secure keys on mount:', err);
        }
      }
    };
    loadSecureKeys();

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
    localStorage.setItem('nyx_coder_models_v3', JSON.stringify(models));
  }, [models]);

  // Load GGUF models dynamically from /api/nyx/local-models
  const loadLocalLibraryModels = async () => {
    if (!localModelsEnabled) {
      setLocalLibraryModels([]);
      return;
    }
    try {
      const res = await fetchWithAuth('/api/v1/nyx/local-models');
      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          const completed = data.models
            .filter((m: any) => m.status === 'completed' || m.status === 'downloading')
            .map((m: any) => ({
              id: m.id,
              name: m.name,
              provider: 'nyx-native',
              description: m.description || `Local GGUF model (${m.size || ''})`,
              specs: {
                contextWindow: m.contextLength || '8K',
                trainingData: 'N/A',
                maxOutput: 'N/A',
                modality: 'Text',
              },
              status: m.status,
            }));
          setLocalLibraryModels(completed);
        }
      }
    } catch (err: any) {
      console.error('[useDashboardState] Failed to load local models:', err);
    }
  };

  useEffect(() => {
    loadLocalLibraryModels();
    const interval = setInterval(loadLocalLibraryModels, 30_000);
    return () => clearInterval(interval);
  }, [localModelsEnabled]);

  useEffect(() => {
    localStorage.setItem('nyx_model_settings', JSON.stringify(modelSettings));
  }, [modelSettings]);

  const setModel = (mid: string) => {
    const targetKey = activeMode === 'chat' ? 'chat' : 'coder';
    setModels((prev) => ({
      ...prev,
      [targetKey]: mid,
    }));
  };

  return {
    // Top-level State
    activeMode,
    setActiveMode,
    modelSettings,
    setModelSettings,
    onExit,

    // Coder states — NYX only
    activeAgent: 'nyx' as const,
    models: { nyx: models[activeMode === 'chat' ? 'chat' : 'coder'] } as Record<'nyx', string>,
    modelsState: models,
    setModels,
    setModel,

    // Registry (simplified)
    localModelsEnabled,
    setLocalModelsEnabled,
    localLibraryModels,

    // Security
    apiKeys,
    updateApiKey,
    clearApiKeys,
    gatewayUrls,
    updateGatewayUrl,

    // Connectivity
    statuses,
    refreshStatuses: async () => {
      await refreshStatuses();
      await loadLocalLibraryModels();
    },

    // Shared usage tracker for features
    trackUsage,
  };
};
