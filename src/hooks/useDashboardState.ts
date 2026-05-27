/**
 * @file src/hooks/useDashboardState.ts
 * @description Monolithic state hook refactored to manage state for CoderDashboard, registry, and settings.
 * NYX is the sole agent — no OpenCode or Claude agent switching.
 */

import { useState, useEffect } from 'react';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';

// Modular Hooks
import { useSecurityState } from './dashboard/useSecurityState';
import { useProviderStatus } from './dashboard/useProviderStatus';

export const useDashboardState = (onExit?: () => void) => {
  const [activeMode, setActiveMode] = useState<'settings' | 'registry' | 'coder'>('coder');
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
          ...parsed
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
  
  // NYX is the only agent — single model state
  const [models, setModels] = useState<Record<'nyx', string>>({
    nyx: ''
  });

  const { usage, updateUsage: trackUsage, refreshProviderQuota } = useTokenUsage();

  const [localModelsEnabled, setLocalModelsEnabled] = useState(false);

  // 2. Security & API Keys
  const security = useSecurityState({}, (provider, key) => refreshProviderQuota(provider, key));

  // 3. Provider Connectivity Status
  const { statuses, refreshStatuses } = useProviderStatus(
    security.apiKeys,
    localModelsEnabled
  );

  // ── Initialization Logic ───────────────────────────────────────────────
  useEffect(() => {
    // Purge old localStorage keys to ensure compliance with vault policy
    localStorage.removeItem('llm_ref_api_keys');
    localStorage.removeItem('llm_ref_api_key');

    const savedModels = localStorage.getItem('nyx_coder_models_v2');
    const savedLocalModelsEnabled = localStorage.getItem('llm_ref_local_models_enabled');
    if (savedLocalModelsEnabled !== null) {
      setLocalModelsEnabled(savedLocalModelsEnabled === 'true');
    }
    
    if (savedModels) {
      try {
        const parsed = JSON.parse(savedModels);
        // Treat old defaults as "no selection" so selector shows placeholder
        const STALE_DEFAULTS = [
          'anthropic/claude-sonnet-4-20250514',
          'gemini-2.5-flash',
          'opencode/big-pickle',
        ];
        const clean = (v: string, fallback = '') =>
          STALE_DEFAULTS.includes(v) ? fallback : (v || fallback);
        // Migrate: use the nyx model, or fallback to any previously saved model
        const nyxModel = clean(parsed.nyx) || clean(parsed.open) || clean(parsed.claude) || '';
        setModels({ nyx: nyxModel });
      } catch (e) {
        console.error("Models load fail", e);
      }
    }

    // Load keys from secure safeStorage vault in Electron on mount
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
            security.setApiKeys(keys);
          }
        } catch (err) {
          console.error('[Vault] Failed to retrieve secure keys on mount:', err);
        }
      }
    };
    loadSecureKeys();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Side Effects (Persistence & Lifecycle) ─────────────────────────────
  useEffect(() => {
    // Only refresh quota for providers that actually have keys (performance fix)
    Object.entries(security.apiKeys).forEach(([p, k]) => {
      if (k) refreshProviderQuota(p, k);
    });
    refreshStatuses();
  }, [security.apiKeys, refreshProviderQuota]);

  useEffect(() => {
    localStorage.setItem('llm_ref_local_models_enabled', String(localModelsEnabled));
    refreshStatuses();
  }, [localModelsEnabled]);

  useEffect(() => {
    localStorage.setItem('nyx_coder_models_v2', JSON.stringify(models));
  }, [models]);

  useEffect(() => {
    localStorage.setItem('nyx_model_settings', JSON.stringify(modelSettings));
  }, [modelSettings]);

  const setModel = (mid: string) => {
    setModels({ nyx: mid });
  };

  return {
    // Top-level State
    activeMode, setActiveMode,
    modelSettings, setModelSettings,
    onExit,

    // Coder states — NYX only
    activeAgent: 'nyx' as const,
    models, setModels, setModel,

    // Registry (simplified)
    localModelsEnabled, setLocalModelsEnabled,

    // Security
    ...security,

    // Connectivity
    statuses, refreshStatuses,
    
    // Shared usage tracker for features
    trackUsage
  };
};
