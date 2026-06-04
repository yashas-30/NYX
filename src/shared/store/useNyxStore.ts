import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ModelProvider, ModelOption } from '@src/types';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

export interface ModelSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  gpuLayers: number;
  threads: number;
  contextSize: number;
  batchSize: number;
  repeatPenalty: number;
  mirostat: number;
  antigravity?: boolean;
}

export type ActiveMode = 'coder' | 'registry' | 'settings';

export type ExecutionMode = 'standard' | 'parallel' | 'ensemble' | 'ab-test';

export interface NyxState {
  activeMode: ActiveMode;
  executionMode: ExecutionMode;
  workspacePath: string;
  localModelsEnabled: boolean;
  modelSettings: ModelSettings;
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  statuses: Record<string, 'online' | 'offline' | 'no-key' | 'invalid-key'>;
  privacyMode: boolean;
  rememberKeys: boolean;
  currentModel: ModelOption;

  // Actions
  setActiveMode: (mode: ActiveMode) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setWorkspacePath: (path: string) => void;
  setLocalModelsEnabled: (enabled: boolean) => void;
  updateModelSettings: (settings: Partial<ModelSettings>) => void;
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
}

const DEFAULT_SETTINGS: ModelSettings = {
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
  antigravity: true,
};

const DEFAULT_MODEL: ModelOption = {
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  provider: 'gemini',
  description: 'Highly Stable Flash model.',
  specs: {
    contextWindow: '1M',
    trainingData: '2025',
    maxOutput: '32K',
    modality: 'Multimodal',
  },
};

export const useNyxStore = create<NyxState>()(
  persist(
    (set, get) => ({
      activeMode: 'coder',
      executionMode: 'standard',
      workspacePath: '',
      localModelsEnabled: false,
      modelSettings: DEFAULT_SETTINGS,
      models: { nyx: '' },
      apiKeys: {},
      statuses: {},
      privacyMode: false,
      rememberKeys: false,
      currentModel: DEFAULT_MODEL,

      setActiveMode: (mode) => set({ activeMode: mode }),
      setExecutionMode: (mode) => set({ executionMode: mode }),
      setWorkspacePath: (path) => set({ workspacePath: path }),
      setLocalModelsEnabled: (enabled) => set({ localModelsEnabled: enabled }),
      updateModelSettings: (settings) =>
        set((state) => ({
          modelSettings: { ...state.modelSettings, ...settings },
        })),
      setModel: (mid) => set({ models: { nyx: mid } }),
      setApiKeys: (keys) => set({ apiKeys: keys }),
      setPrivacyMode: (enabled) => {
        if (enabled) {
          set({ privacyMode: enabled, apiKeys: {}, statuses: {} });
        } else {
          set({ privacyMode: enabled });
        }
      },
      setRememberKeys: (enabled) => set({ rememberKeys: enabled }),
      clearPrivacyData: () => {
        set({ apiKeys: {}, statuses: {} });
      },
      setCurrentModel: (model) => set({ currentModel: model }),

      updateApiKey: async (provider, key) => {
        const { privacyMode, rememberKeys } = get();
        if (privacyMode || !rememberKeys) {
          // In privacy mode or when rememberKeys is disabled, store in memory only
          set((state) => ({
            apiKeys: { ...state.apiKeys, [provider]: key },
          }));
          await get().refreshStatuses();
          return;
        }

        const ipc = (window as any).nyxIPC;
        if (ipc && typeof ipc.invoke === 'function') {
          try {
            await ipc.invoke('vault:store-key', { provider, key });
            set((state) => ({
              apiKeys: { ...state.apiKeys, [provider]: key },
            }));
            await get().refreshStatuses();
          } catch (err: any) {
            console.error(`[Vault Store key failed for ${provider}]:`, err);
          }
        } else {
          // Fallback if not in Native main process context
          set((state) => ({
            apiKeys: { ...state.apiKeys, [provider]: key },
          }));
          await get().refreshStatuses();
        }
      },

      clearApiKeys: async () => {
        const ipc = (window as any).nyxIPC;
        const providers = Object.keys(get().apiKeys);
        if (ipc && typeof ipc.invoke === 'function') {
          for (const provider of providers) {
            try {
              await ipc.invoke('vault:delete-key', { provider });
            } catch (err: any) {
              console.error(`[Vault delete key failed for ${provider}]:`, err);
            }
          }
        }
        set({ apiKeys: {}, statuses: {} });
      },

      fetchWorkspacePath: async () => {
        try {
          const res = await fetchWithAuth('/api/v1/workspace');
          if (res.ok) {
            const data = await res.json();
            set({ workspacePath: data.workspace || '' });
          }
        } catch (e: any) {
          console.error('[Store] Failed to fetch workspace path:', e);
        }
      },

      selectWorkspace: async () => {
        const ipc = (window as any).nyxIPC;
        if (ipc && typeof ipc.showOpenDirectory === 'function') {
          try {
            const directory = await ipc.showOpenDirectory();
            if (directory) {
              // Post to API to set active workspace
              const res = await fetchWithAuth('/api/v1/workspace/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: directory }),
              });
              if (res.ok) {
                set({ workspacePath: directory });
              }
            }
          } catch (err: any) {
            console.error('[Store] Directory selection failed:', err);
          }
        } else {
          console.warn('[Store] Select workspace called outside secure Native context.');
        }
      },

      createWorkspace: async (path: string, name: string) => {
        try {
          const res = await fetchWithAuth('/api/v1/workspace/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, name }),
          });
          if (res.ok) {
            const data = await res.json();
            set({ workspacePath: data.workspace });
            return { success: true, workspace: data.workspace };
          }
          const errData = await res
            .json()
            .catch(() => ({ error: 'Network error creating workspace' }));
          return { success: false, error: errData.error || 'Failed to create workspace' };
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      },

      loadSecureKeys: async () => {
        const { rememberKeys } = get();
        if (!rememberKeys) return; // Do not auto-load saved keys if rememberKeys is disabled

        const ipc = (window as any).nyxIPC;
        if (ipc && typeof ipc.invoke === 'function') {
          // fallow-ignore-next-line code-duplication
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
              set({ apiKeys: keys });
              await get().refreshStatuses();
            }
          } catch (err: any) {
            console.error('[Store] Failed to retrieve secure keys on mount:', err);
          }
        }
      },

      refreshStatuses: async () => {
        const cloudProviders: ModelProvider[] = ['gemini'];
        const newStatuses: Record<string, 'online' | 'offline' | 'no-key' | 'invalid-key'> = {};

        try {
          // Check local models status
          const localEnabled =
            get().localModelsEnabled ||
            (typeof localStorage !== 'undefined' &&
              localStorage.getItem('nyx_local_models_enabled') === 'true');
          if (localEnabled) {
            const nativeRes = await fetchWithAuth('/api/v1/nyx/local-models/status').catch(
              () => null
            );
            if (nativeRes && nativeRes.ok) {
              const data = await nativeRes.json();
              if (data.activeModelId) {
                // Ping the model with a trivial request
                const healthRes = await fetchWithAuth('/api/v1/nyx/local-models/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: data.activeModelId,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1,
                  }),
                }).catch(() => null);
                newStatuses['nyx-native'] = healthRes?.ok ? 'online' : 'offline';
              } else {
                newStatuses['nyx-native'] = 'offline';
              }
            } else {
              newStatuses['nyx-native'] = 'offline';
            }
          } else {
            newStatuses['nyx-native'] = 'offline';
          }

          // Check safeStorage vault configuration for cloud providers
          const vaultRes = await fetch('/api/v1/vault/status').catch(() => null);
          const vaultStatus = vaultRes && vaultRes.ok ? await vaultRes.json() : {};

          for (const p of cloudProviders) {
            const hasVaultKey = vaultStatus[p];
            const hasMemoryKey = !!get().apiKeys[p];

            if (hasVaultKey || hasMemoryKey) {
              try {
                const validateRes = await fetchWithAuth('/api/v1/vault/validate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ provider: p, apiKey: get().apiKeys[p] || '' }),
                });
                newStatuses[p] = validateRes.ok ? 'online' : 'invalid-key';
              } catch {
                newStatuses[p] = 'offline';
              }
            } else {
              newStatuses[p] = 'no-key';
            }
          }
          set({ statuses: newStatuses });
        } catch (e: any) {
          console.warn('[Store] Status checks failed:', e);
        }
      },
    }),
    {
      name: 'nyx-global-state',
      partialize: (state) => ({
        activeMode: state.activeMode,
        executionMode: state.executionMode,
        localModelsEnabled: state.localModelsEnabled,
        modelSettings: state.modelSettings,
        models: state.models,
        privacyMode: state.privacyMode,
        rememberKeys: state.rememberKeys,
        currentModel: state.currentModel,
      }),
    }
  )
);
