/**
 * @file src/hooks/useDashboardState.ts
 * @description Monolithic state hook refactored to manage state for CoderDashboard, registry, and settings.
 * NYX is the sole agent — no OpenCode or Claude agent switching.
 */

import { useState, useEffect } from 'react';
import { useTokenUsage } from '../context/TokenUsageContext';

// Modular Hooks
import { useModelRegistry } from './dashboard/useModelRegistry';
import { useSecurityState } from './dashboard/useSecurityState';
import { useProviderStatus } from './dashboard/useProviderStatus';

export const useDashboardState = (onExit?: () => void) => {
  const [activeMode, setActiveMode] = useState<'settings' | 'registry' | 'coder'>('coder');
  const [modelSettings, setModelSettings] = useState({
    temperature: 0.7,
    maxTokens: 16384,
    topP: 0.95,
    topK: 40
  });
  
  // NYX is the only agent — single model state
  const [models, setModels] = useState<Record<'nyx', string>>({
    nyx: ''
  });

  const { usage, updateUsage: trackUsage, refreshProviderQuota } = useTokenUsage();

  // 1. Model Registry (Ollama/LM Studio)
  const registry = useModelRegistry('http://localhost:1234');

  // 2. Security & API Keys
  const security = useSecurityState({}, (provider, key) => refreshProviderQuota(provider, key));

  // 3. Provider Connectivity Status
  const { statuses, refreshStatuses } = useProviderStatus(
    security.apiKeys,
    registry.lmStudioBaseUrl,
    registry.ollamaBaseUrl,
    registry.localModelsEnabled
  );

  // ── Initialization Logic ───────────────────────────────────────────────
  useEffect(() => {
    const savedKeys = localStorage.getItem('llm_ref_api_keys');
    const savedLegacyKey = localStorage.getItem('llm_ref_api_key');
    const savedLmUrl = localStorage.getItem('llm_ref_lmstudio_url');
    const savedOllamaUrl = localStorage.getItem('llm_ref_ollama_url');
    const savedModels = localStorage.getItem('nyx_coder_models_v2');
    const savedLocalModelsEnabled = localStorage.getItem('llm_ref_local_models_enabled');

    if (savedKeys) {
      try { security.setApiKeys(JSON.parse(savedKeys)); } catch (e) { console.error("Keys load fail", e); }
    } else if (savedLegacyKey) {
      security.setApiKeys({ gemini: savedLegacyKey });
    }
    if (savedLmUrl) registry.setLmStudioBaseUrl(savedLmUrl);
    if (savedOllamaUrl) registry.setOllamaBaseUrl(savedOllamaUrl);
    if (savedLocalModelsEnabled !== null) {
      registry.setLocalModelsEnabled(savedLocalModelsEnabled === 'true');
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Side Effects (Persistence & Lifecycle) ─────────────────────────────
  useEffect(() => {
    localStorage.setItem('llm_ref_api_keys', JSON.stringify(security.apiKeys));
    // Only refresh quota for providers that actually have keys (performance fix)
    Object.entries(security.apiKeys).forEach(([p, k]) => {
      if (k) refreshProviderQuota(p, k);
    });
    refreshStatuses();
  }, [security.apiKeys, refreshProviderQuota]);

  useEffect(() => {
    localStorage.setItem('llm_ref_local_models_enabled', String(registry.localModelsEnabled));
    if (registry.localModelsEnabled) {
      registry.fetchLMStudioModels(registry.lmStudioBaseUrl);
      registry.fetchOllamaModels(registry.ollamaBaseUrl);
    }
    refreshStatuses();
  }, [registry.localModelsEnabled]);

  useEffect(() => {
    localStorage.setItem('llm_ref_lmstudio_url', registry.lmStudioBaseUrl);
    if (registry.localModelsEnabled) {
      registry.fetchLMStudioModels(registry.lmStudioBaseUrl);
    }
    refreshStatuses();
  }, [registry.lmStudioBaseUrl]);

  useEffect(() => {
    localStorage.setItem('llm_ref_ollama_url', registry.ollamaBaseUrl);
    if (registry.localModelsEnabled) {
      registry.fetchOllamaModels(registry.ollamaBaseUrl);
    }
    refreshStatuses();
  }, [registry.ollamaBaseUrl]);

  useEffect(() => {
    localStorage.setItem('nyx_coder_models_v2', JSON.stringify(models));
  }, [models]);

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

    // Registry
    ...registry,

    // Security
    ...security,

    // Connectivity
    statuses, refreshStatuses,
    
    // Shared usage tracker for features
    trackUsage
  };
};
