/**
 * @file src/hooks/useDashboardState.ts
 * @description Monolithic state hook being progressively refactored into a modular architecture.
 */

import { useState, useEffect } from 'react';
import { useTokenUsage } from '../context/TokenUsageContext';
import { AVAILABLE_MODELS } from '@/src/config/models';

// Modular Hooks
import { useModelRegistry } from './dashboard/useModelRegistry';
import { useSecurityState } from './dashboard/useSecurityState';
import { useComparisonLogic } from './dashboard/useComparisonLogic';
import { useTerminalPolling } from './dashboard/useTerminalPolling';
import { useProviderStatus } from './dashboard/useProviderStatus';

export const useDashboardState = (onExit?: () => void) => {
  const [activeMode, setActiveMode] = useState<'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [modelSettings, setModelSettings] = useState({
    temperature: 0.7,
    maxTokens: 512,
    topP: 0.95,
    topK: 40
  });

  const { usage, updateUsage: trackUsage, refreshProviderQuota } = useTokenUsage();

  // 1. Model Registry (Ollama/LM Studio)
  const registry = useModelRegistry('http://localhost:1234');

  // 2. Security & API Keys
  const security = useSecurityState({}, (provider, key) => refreshProviderQuota(provider, key));

  // 3. Provider Connectivity Status
  const { statuses, refreshStatuses } = useProviderStatus(security.apiKeys, registry.lmStudioBaseUrl, registry.ollamaBaseUrl);

  // 4. Comparison Logic (Benchmarking Grid)
  const comparison = useComparisonLogic(
    security.apiKeys,
    registry.ollamaModels,
    registry.lmStudioModels,
    modelSettings,
    trackUsage,
    registry.lmStudioBaseUrl,
    registry.ollamaBaseUrl,
    security.gatewayUrls
  );

  // 5. Terminal Polling
  useTerminalPolling(comparison.columns, comparison.setColumns);

  // ── Initialization Logic ───────────────────────────────────────────────
  useEffect(() => {
    const savedHistory = localStorage.getItem('llm_ref_history');
    const savedKeys = localStorage.getItem('llm_ref_api_keys');
    const savedLegacyKey = localStorage.getItem('llm_ref_api_key');
    const savedLmUrl = localStorage.getItem('llm_ref_lmstudio_url');
    const savedOllamaUrl = localStorage.getItem('llm_ref_ollama_url');

    if (savedHistory) {
      try { comparison.setHistory(JSON.parse(savedHistory)); } catch (e) { console.error("History load fail", e); }
    }
    if (savedKeys) {
      try { security.setApiKeys(JSON.parse(savedKeys)); } catch (e) { console.error("Keys load fail", e); }
    } else if (savedLegacyKey) {
      security.setApiKeys({ gemini: savedLegacyKey });
    }
    if (savedLmUrl) registry.setLmStudioBaseUrl(savedLmUrl);
    if (savedOllamaUrl) registry.setOllamaBaseUrl(savedOllamaUrl);

    registry.fetchOllamaModels(savedOllamaUrl ?? 'http://localhost:11434');
    registry.fetchLMStudioModels(savedLmUrl ?? 'http://localhost:1234');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Side Effects (Persistence & Lifecycle) ─────────────────────────────
  useEffect(() => {
    localStorage.setItem('llm_ref_history', JSON.stringify(comparison.history));
  }, [comparison.history]);

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
    if (comparison.columns.length === 0) {
      import('@/src/lib/api/lmStudioClient').then(({ ejectAllLMStudio }) => {
        ejectAllLMStudio(registry.lmStudioBaseUrl);
      });
    }
  }, [comparison.columns.length, registry.lmStudioBaseUrl]);

  return {
    // Top-level State
    activeMode, setActiveMode,
    searchQuery, setSearchQuery,
    providerFilter, setProviderFilter,
    modelSettings, setModelSettings,
    onExit,

    // Comparison/Grid (Benchmarking)
    ...comparison,

    // Registry
    ...registry,

    // Security
    ...security,

    // Connectivity
    statuses, refreshStatuses,

    // History Helpers
    deleteHistoryItem: (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      comparison.setHistory((prev) => prev.filter((item) => item.id !== id));
    },
    restoreHistory: (item: any) => comparison.restoreHistory(item, setActiveMode),
    
    // Shared usage tracker for features
    trackUsage
  };
};
