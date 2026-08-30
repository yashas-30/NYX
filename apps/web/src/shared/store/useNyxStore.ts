import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ModelProvider, ModelOption } from '@src/types';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { detectProvider } from '@src/infrastructure/utils/provider';

import { invoke } from '@tauri-apps/api/core';

export interface ModelSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  gpuLayers?: number;
  threads: number;
  contextSize: number;
  batchSize: number;
  repeatPenalty: number;
  mirostat: number;
  antigravity?: boolean;
  flashAttention?: boolean;
  kvCacheType?: string;
  useMlock?: boolean;
  draftModelId?: string;
  disableKvOffload?: boolean;
  splitMode?: string;
  tensorSplit?: string;
}

export type ActiveMode =
  | 'chat'
  | 'registry'
  | 'settings'
  | 'compare'
  | 'workspace'
  | 'plugins'
  | 'projects'
  | 'swarm'
  | 'git'
  | 'documents'
  | 'images'
  | 'mcp'
  | 'tasks'
  | 'ide';

export interface NyxState {
  activeMode: ActiveMode;
  workspacePath: string;
  localModelsEnabled: boolean;
  modelSettings: ModelSettings;
  modelConfigs?: Record<string, ModelSettings>;
  modelSystemPrompts?: Record<string, string>;
  cloudModelId: string | null;
  localModelId: string | null;
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  statuses: Record<string, 'online' | 'offline' | 'no-key' | 'invalid-key'>;
  privacyMode: boolean;
  rememberKeys: boolean;
  currentModel: ModelOption;
  searchProvider: 'duckduckgo' | 'tavily';
  setSearchProvider: (provider: 'duckduckgo' | 'tavily') => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  executionMode: 'chat' | 'coder' | 'default';
  advancedLocalModelSettings: boolean;
  setAdvancedLocalModelSettings: (enabled: boolean) => void;

  // Actions
  setActiveMode: (mode: ActiveMode) => void;
  setExecutionMode: (mode: 'chat' | 'coder' | 'default') => void;
  setWorkspacePath: (path: string) => void;
  setLocalModelsEnabled: (enabled: boolean) => void;
  updateModelSettings: (settings: Partial<ModelSettings>) => void;
  updateModelConfig: (id: string, settings: Partial<ModelSettings>) => void;
  updateModelSystemPrompt: (id: string, prompt: string) => void;
  setCloudModelId: (id: string | null) => void;
  setLocalModelId: (id: string | null) => void;
  setModel: (mid: string) => void;
  setApiKeys: (keys: Record<string, string>) => void;
  updateApiKey: (provider: string, key: string) => Promise<void>;
  clearApiKeys: () => Promise<void>;
  setPrivacyMode: (enabled: boolean) => void;
  setRememberKeys: (enabled: boolean) => void;
  clearPrivacyData: () => void;
  setCurrentModel: (model: ModelOption) => void;

  // Lifecycle & Sync actions
  fetchWorkspacePath: () => Promise<void>;
  selectWorkspace: () => Promise<void>;
  createWorkspace: (
    path: string,
    name: string
  ) => Promise<{ success: boolean; workspace?: string; error?: string }>;
  loadSecureKeys: () => Promise<void>;
  refreshStatuses: () => Promise<void>;
  deleteApiKey: (provider: string) => Promise<boolean>;
}

export const DEFAULT_SETTINGS: ModelSettings = {
  temperature: 0.7,
  maxTokens: 16384,
  topP: 0.95,
  topK: 40,
  gpuLayers: undefined,
  threads: 0,
  contextSize: 0,
  batchSize: 0,
  repeatPenalty: 1.1,
  mirostat: 0,
  antigravity: true,
  flashAttention: true,
  kvCacheType: 'auto',
  useMlock: false,
  draftModelId: '',
  disableKvOffload: false,
};

const DEFAULT_MODEL: ModelOption = AVAILABLE_MODELS[0];

export const useNyxStore = create<NyxState>()(
  persist(
    (set, get) => ({
      activeMode: 'chat',
      workspacePath: '',
      localModelsEnabled: true,
      modelSettings: DEFAULT_SETTINGS,
      cloudModelId: DEFAULT_MODEL.provider !== 'nyx-native' ? DEFAULT_MODEL.id : null,
      localModelId: DEFAULT_MODEL.provider === 'nyx-native' ? DEFAULT_MODEL.id : null,
      models: { nyx: DEFAULT_MODEL.id },
      apiKeys: {},
      statuses: {},
      privacyMode: false,
      rememberKeys: true,
      currentModel: DEFAULT_MODEL,
      searchProvider: 'duckduckgo',
      activeProjectId: null,
      executionMode: 'default',
      advancedLocalModelSettings: false,

      setActiveMode: (mode) => set({ activeMode: mode }),
      setExecutionMode: (mode) => set({ executionMode: mode }),
      setWorkspacePath: (path) => set({ workspacePath: path }),
      setLocalModelsEnabled: (enabled) => set({ localModelsEnabled: enabled }),
      setAdvancedLocalModelSettings: (enabled) => set({ advancedLocalModelSettings: enabled }),
      updateModelSettings: (settings) =>
        set((state) => {
          const newSettings = { ...state.modelSettings, ...settings };
          const configs = state.modelConfigs || {};
          // Determine the active model ID correctly instead of relying on currentModel (which might be stale)
          const activeId = state.localModelId || state.cloudModelId || state.models.nyx;
          return {
            modelSettings: newSettings,
            modelConfigs: { ...configs, [activeId]: newSettings },
          };
        }),
      updateModelConfig: (id, settings) =>
        set((state) => {
          const configs = state.modelConfigs || {};
          const currentConfig = configs[id] || state.modelSettings;
          const newConfig = { ...currentConfig, ...settings };

          // If the updated model is currently active, also update modelSettings
          const activeId = state.localModelId || state.cloudModelId || state.models.nyx;
          if (activeId === id) {
            return {
              modelSettings: newConfig,
              modelConfigs: { ...configs, [id]: newConfig },
            };
          }

          return {
            modelConfigs: { ...configs, [id]: newConfig },
          };
        }),
      updateModelSystemPrompt: (id, prompt) =>
        set((state) => {
          const prompts = state.modelSystemPrompts || {};
          return {
            modelSystemPrompts: { ...prompts, [id]: prompt },
          };
        }),
      setCloudModelId: (id) =>
        set((state) => {
          const configs = state.modelConfigs || {};
          const storedSettings = id ? configs[id] : undefined;
          const matchedModel = id ? AVAILABLE_MODELS.find((m) => m.id === id) : null;
          const currentModel =
            matchedModel ||
            (id
              ? {
                  id,
                  name: id,
                  provider: detectProvider(id),
                  description: 'Active model',
                  status: 'ga' as const,
                  specs: { contextWindow: '128K', maxOutput: '16K', modality: 'Text' as const },
                }
              : state.currentModel);
          return {
            cloudModelId: id,
            localModelId: null,
            currentModel,
            models: id ? { nyx: id } : state.models,
            modelSettings: storedSettings || DEFAULT_SETTINGS,
          };
        }),
      setLocalModelId: (id) =>
        set((state) => {
          const configs = state.modelConfigs || {};
          const storedSettings = id ? configs[id] : undefined;
          const matchedModel = id ? AVAILABLE_MODELS.find((m) => m.id === id) : null;
          const currentModel =
            matchedModel ||
            (id
              ? {
                  id,
                  name: id,
                  provider: 'nyx-native' as const,
                  description: 'Active model',
                  status: 'ga' as const,
                  specs: { contextWindow: '32K', maxOutput: '4K', modality: 'Text' as const },
                }
              : state.currentModel);
          return {
            localModelId: id,
            cloudModelId: null,
            currentModel,
            models: id ? { nyx: id } : state.models,
            modelSettings: storedSettings || DEFAULT_SETTINGS,
          };
        }),
      setModel: (mid) =>
        set((state) => {
          const isLocal =
            mid?.startsWith('local:') || mid?.includes('.gguf') || mid?.includes('nyx-native');
          const matchedModel = AVAILABLE_MODELS.find((m) => m.id === mid);
          const configs = state.modelConfigs || {};
          const storedSettings = mid ? configs[mid] : undefined;
          return {
            models: { nyx: mid },
            cloudModelId: isLocal ? null : mid,
            localModelId: isLocal ? mid : null,
            currentModel:
              matchedModel ||
              (mid
                ? {
                    id: mid,
                    name: mid,
                    provider: isLocal ? 'nyx-native' : detectProvider(mid),
                    description: 'Active model',
                    status: 'ga',
                    specs: { contextWindow: '128K', maxOutput: '16K', modality: 'Text' },
                  }
                : state.currentModel),
            modelSettings: storedSettings || state.modelSettings,
          };
        }),
      setSearchProvider: (provider) => set({ searchProvider: provider }),
      setActiveProjectId: (id) => set({ activeProjectId: id }),
      setApiKeys: (keys) => set({ apiKeys: keys }),
      setPrivacyMode: (enabled) => {
        if (enabled) {
          set({ privacyMode: enabled, apiKeys: {}, statuses: {} });
        } else {
          set({ privacyMode: enabled });
        }
      },
      setRememberKeys: async (enabled) => {
        set({ rememberKeys: enabled });
        const { apiKeys } = get();

        if (enabled) {
          // Persist all current keys into secure device vault
          for (const provider of Object.keys(apiKeys)) {
            const val = apiKeys[provider];
            if (val && val.trim().length > 0) {
              try {
                await invoke('vault:store-key', { provider, key: val });
              } catch (err) {
                console.error(`[Vault] Failed to persist ${provider} key:`, err);
              }
            }
          }
        }
      },

      clearPrivacyData: () => {
        set({ apiKeys: {}, statuses: {} });
      },
      setCurrentModel: (model) =>
        set((state) => {
          const configs = state.modelConfigs || {};
          const storedSettings = configs[model.id];
          const isLocal =
            model.provider === 'nyx-native' ||
            model.id.startsWith('local:') ||
            model.id.includes('.gguf');
          return {
            currentModel: model,
            cloudModelId: isLocal ? null : model.id,
            localModelId: isLocal ? model.id : null,
            models: { nyx: model.id },
            modelSettings: storedSettings || DEFAULT_SETTINGS,
          };
        }),

      updateApiKey: async (provider: string, key: string) => {
        set((state) => ({ apiKeys: { ...state.apiKeys, [provider]: key } }));

        try {
          if (key && key.trim().length > 0) {
            await invoke('vault:store-key', { provider, key });
          } else {
            await invoke('vault:delete-key', { provider });
          }
          await get().refreshStatuses();
        } catch (err: any) {
          console.error(`[Vault Store key failed for ${provider}]:`, err);
        }
      },

      clearApiKeys: async () => {
        const providers = ['gemini', 'openrouter', 'nvidia-nim', 'groq', 'mistral', 'huggingface'];
        for (const provider of providers) {
          try {
            await invoke('vault:delete-key', { provider });
          } catch (err: any) {
            console.error(`[Vault delete key failed for ${provider}]:`, err);
          }
        }
        set({ apiKeys: {}, statuses: {} });
      },

      fetchWorkspacePath: async () => {
        try {
          const res: any = { ok: true, json: async () => await invoke('workspace_get') };
          if (res.ok) {
            const data = await res.json();
            set({ workspacePath: data.workspace || '' });
          }
        } catch (e: any) {
          console.error('[Store] Failed to fetch workspace path:', e);
        }
      },

      selectWorkspace: async () => {
        try {
          const res: any = await invoke('dialog_open_directory');
          const directory = res && res.success ? res.data : null;
          if (directory) {
            await invoke('workspace_select', { path: directory });
            set({ workspacePath: directory });
          }
        } catch (err: any) {
          console.error('[Store] Directory selection failed:', err);
        }
      },

      createWorkspace: async (path: string, name: string) => {
        try {
          const data: any = await invoke('workspace_create', { path, name });
          set({ workspacePath: data.workspace });
          return { success: true, workspace: data.workspace };
        } catch (error: any) {
          return { success: false, error: error.message || 'Failed to create workspace' };
        }
      },

      loadSecureKeys: async () => {
        try {
          // 1. Load keys from native secure device vault (keyring / DPAPI / local persistent vault)
          const listRes: any = await invoke('vault:list-keys').catch(() => null);
          if (
            listRes &&
            listRes.success &&
            Array.isArray(listRes.data) &&
            listRes.data.length > 0
          ) {
            const keys: Record<string, string> = {};
            await Promise.all(
              listRes.data.map(async (provider: string) => {
                const getRes: any = await invoke('vault:get-key', { provider }).catch(() => null);
                if (getRes && getRes.success && getRes.data) {
                  keys[provider] = getRes.data;
                }
              })
            );
            set((state) => ({ apiKeys: { ...state.apiKeys, ...keys } }));
          }
          await get().refreshStatuses();
        } catch (err: any) {
          console.error('[Store] Failed to retrieve secure keys on mount:', err);
        }
      },

      deleteApiKey: async (provider: string): Promise<boolean> => {
        const { apiKeys } = get();
        const updatedKeys = { ...apiKeys };
        delete updatedKeys[provider];
        set({ apiKeys: updatedKeys });

        try {
          await invoke('vault:delete-key', { provider }).catch(() => {});
          return true;
        } catch (err: any) {
          console.error('[Store] Failed to delete vault key:', err);
          return false;
        }
      },

      refreshStatuses: async () => {
        // All providers that have API key slots and need status checking
        const cloudProviders: ModelProvider[] = [
          'gemini',
          'openrouter',
          'groq',
          'mistral',
          'nvidia-nim',
        ];
        const newStatuses: Record<string, 'online' | 'offline' | 'no-key' | 'invalid-key'> = {};

        try {
          // Check safeStorage vault configuration for cloud providers
          let vaultStatus: Record<string, boolean> = {};
          try {
            const vaultRes: any = await invoke('vault:status').catch(() => null);
            if (vaultRes && vaultRes.success && vaultRes.data) {
              vaultStatus = vaultRes.data;
            }
          } catch (e) {
            console.warn('Failed to fetch vault status via IPC', e);
          }

          await Promise.all(
            cloudProviders.map(async (p) => {
              const hasVaultKey = vaultStatus[p];
              const hasMemoryKey = !!get().apiKeys[p];

              if (hasVaultKey || hasMemoryKey) {
                try {
                  const validateRes: any = await invoke('vault_validate', {
                    provider: p,
                    apiKey: get().apiKeys[p] || '',
                  }).catch(() => ({ success: true }));
                  newStatuses[p] = validateRes && validateRes.success ? 'online' : 'invalid-key';
                } catch {
                  newStatuses[p] = 'online';
                }
              } else {
                newStatuses[p] = 'no-key';
              }
            })
          );
          set({ statuses: newStatuses });
        } catch (e: any) {
          console.warn('[Store] Status checks failed:', e);
        }
      },
    }),
    {
      name: 'nyx-global-state',
      version: 5,
      migrate: (persistedState: any, version: number) => {
        if (version <= 4) {
          if (persistedState.modelSettings && persistedState.modelSettings.gpuLayers === 99) {
            persistedState.modelSettings.gpuLayers = undefined;
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.loadSecureKeys?.();
        }
      },
      partialize: (state) => ({
        activeMode: state.activeMode,
        executionMode: state.executionMode,
        localModelsEnabled: state.localModelsEnabled,
        modelSettings: state.modelSettings,
        modelConfigs: state.modelConfigs,
        cloudModelId: state.cloudModelId,
        localModelId: state.localModelId,
        models: state.models,
        privacyMode: state.privacyMode,
        rememberKeys: state.rememberKeys,
        apiKeys: {}, // Security Fix: Never store API keys in plaintext localStorage
        currentModel: state.currentModel,
        searchProvider: state.searchProvider,
        advancedLocalModelSettings: state.advancedLocalModelSettings,
        modelSystemPrompts: state.modelSystemPrompts,
      }),
    }
  )
);
