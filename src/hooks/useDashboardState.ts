/**
 * @file src/hooks/useDashboardState.ts
 * @description Monolithic state hook refactored to manage state for CoderDashboard, registry, and settings.
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
    maxTokens: 4096,
    topP: 0.95,
    topK: 40
  });
  
  // Coder Specific States (shared and persistent)
  const [activeAgent, setActiveAgent] = useState<'open' | 'claude' | 'nyx'>('nyx');
  const [models, setModels] = useState<Record<'open' | 'claude' | 'nyx', string>>({
    open: 'opencode/big-pickle',
    claude: 'anthropic/claude-sonnet-4-20250514',
    nyx: 'anthropic/claude-sonnet-4-20250514'
  });

  const { usage, updateUsage: trackUsage, refreshProviderQuota } = useTokenUsage();

  // 1. Model Registry (Ollama/LM Studio)
  const registry = useModelRegistry('http://localhost:1234');

  // 2. Security & API Keys
  const security = useSecurityState({}, (provider, key) => refreshProviderQuota(provider, key));

  // 3. Provider Connectivity Status
  const { statuses, refreshStatuses } = useProviderStatus(security.apiKeys, registry.lmStudioBaseUrl, registry.ollamaBaseUrl);

  // ── Initialization Logic ───────────────────────────────────────────────
  useEffect(() => {
    const savedKeys = localStorage.getItem('llm_ref_api_keys');
    const savedLegacyKey = localStorage.getItem('llm_ref_api_key');
    const savedLmUrl = localStorage.getItem('llm_ref_lmstudio_url');
    const savedOllamaUrl = localStorage.getItem('llm_ref_ollama_url');
    const savedModels = localStorage.getItem('nyx_coder_models_v2');
    const savedAgent = localStorage.getItem('nyx_coder_active_agent');

    if (savedKeys) {
      try { security.setApiKeys(JSON.parse(savedKeys)); } catch (e) { console.error("Keys load fail", e); }
    } else if (savedLegacyKey) {
      security.setApiKeys({ gemini: savedLegacyKey });
    }
    if (savedLmUrl) registry.setLmStudioBaseUrl(savedLmUrl);
    if (savedOllamaUrl) registry.setOllamaBaseUrl(savedOllamaUrl);
    
    if (savedModels) {
      try {
        const parsed = JSON.parse(savedModels);
        setModels({
          open: parsed.open || 'opencode/big-pickle',
          claude: parsed.claude || 'anthropic/claude-sonnet-4-20250514',
          nyx: parsed.nyx || 'anthropic/claude-sonnet-4-20250514'
        });
      } catch (e) {
        console.error("Models load fail", e);
      }
    }
    if (savedAgent) {
      setActiveAgent('nyx');
    }

    registry.fetchOllamaModels(savedOllamaUrl ?? 'http://localhost:11434');
    registry.fetchLMStudioModels(savedLmUrl ?? 'http://localhost:1234');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Side Effects (Persistence & Lifecycle) ─────────────────────────────
  useEffect(() => {
    localStorage.setItem('llm_ref_api_keys', JSON.stringify(security.apiKeys));
    Object.entries(security.apiKeys).forEach(([p, k]) => refreshProviderQuota(p, k));
    refreshStatuses();
  }, [security.apiKeys, refreshProviderQuota]);

  useEffect(() => {
    localStorage.setItem('llm_ref_lmstudio_url', registry.lmStudioBaseUrl);
    registry.fetchLMStudioModels(registry.lmStudioBaseUrl);
    refreshStatuses();
  }, [registry.lmStudioBaseUrl]);

  useEffect(() => {
    localStorage.setItem('llm_ref_ollama_url', registry.ollamaBaseUrl);
    registry.fetchOllamaModels(registry.ollamaBaseUrl);
    refreshStatuses();
  }, [registry.ollamaBaseUrl]);

  useEffect(() => {
    localStorage.setItem('nyx_coder_models_v2', JSON.stringify(models));
  }, [models]);

  useEffect(() => {
    localStorage.setItem('nyx_coder_active_agent', activeAgent);
  }, [activeAgent]);

  const setModel = (mid: string) => {
    setModels(prev => ({ ...prev, [activeAgent]: mid }));
  };

  return {
    // Top-level State
    activeMode, setActiveMode,
    modelSettings, setModelSettings,
    onExit,

    // Coder states
    activeAgent, setActiveAgent,
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
