import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ModelProvider } from '@src/types';
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
}

export type ActiveMode = 'coder' | 'registry' | 'settings';

export interface NyxState {
  activeMode: ActiveMode;
  workspacePath: string;
  localModelsEnabled: boolean;
  modelSettings: ModelSettings;
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  statuses: Record<string, 'online' | 'offline' | 'no-key'>;
  privacyMode: boolean;
  rememberKeys: boolean;
  
  // Actions
  setActiveMode: (mode: ActiveMode) => void;
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
  
  // Lifecycle & Sync actions
  fetchWorkspacePath: () => Promise<void>;
  selectWorkspace: () => Promise<void>;
  createWorkspace: (path: string, name: string) => Promise<{ success: boolean; workspace?: string; error?: string }>;
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
};

export const useNyxStore = create<NyxState>()(
  persist(
    (set, get) => ({
      activeMode: 'coder',
      workspacePath: '',
      localModelsEnabled: false,
      modelSettings: DEFAULT_SETTINGS,
      models: { nyx: '' },
      apiKeys: {},
      statuses: {},
      privacyMode: false,
      rememberKeys: false,

      setActiveMode: (mode) => set({ activeMode: mode }),
      setWorkspacePath: (path) => set({ workspacePath: path }),
      setLocalModelsEnabled: (enabled) => set({ localModelsEnabled: enabled }),
      updateModelSettings: (settings) =>
        set((state) => ({
          modelSettings: { ...state.modelSettings, ...settings },
        })),
      setModel: (mid) => set({ models: { nyx: mid } }),
      setApiKeys: (keys) => set({ apiKeys: keys }),
      setPrivacyMode: (enabled) => {
        set({ privacyMode: enabled });
        if (enabled) {
          get().clearPrivacyData();
        }
      },
      setRememberKeys: (enabled) => set({ rememberKeys: enabled }),
      clearPrivacyData: () => {
        set({ apiKeys: {}, statuses: {} });
      },

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
          } catch (err) {
            console.error(`[Vault Store key failed for ${provider}]:`, err);
          }
        } else {
          // Fallback if not in Electron main process context
          set((state) => ({
            apiKeys: { ...state.apiKeys, [provider]: key },
          }));
        }
      },

      clearApiKeys: async () => {
        const ipc = (window as any).nyxIPC;
        const providers = Object.keys(get().apiKeys);
        if (ipc && typeof ipc.invoke === 'function') {
          for (const provider of providers) {
            try {
              await ipc.invoke('vault:delete-key', { provider });
            } catch (err) {
              console.error(`[Vault delete key failed for ${provider}]:`, err);
            }
          }
        }
        set({ apiKeys: {}, statuses: {} });
      },

      fetchWorkspacePath: async () => {
        try {
          const res = await fetchWithAuth('/api/workspace');
          if (res.ok) {
            const data = await res.json();
            set({ workspacePath: data.workspace || '' });
          }
        } catch (e) {
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
              const res = await fetchWithAuth('/api/workspace/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: directory })
              });
              if (res.ok) {
                set({ workspacePath: directory });
              }
            }
          } catch (err) {
            console.error('[Store] Directory selection failed:', err);
          }
        } else {
          console.warn('[Store] Select workspace called outside secure Electron context.');
        }
      },

      createWorkspace: async (path: string, name: string) => {
        try {
          const res = await fetchWithAuth('/api/workspace/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, name })
          });
          if (res.ok) {
            const data = await res.json();
            set({ workspacePath: data.workspace });
            return { success: true, workspace: data.workspace };
          }
          const errData = await res.json().catch(() => ({ error: 'Network error creating workspace' }));
          return { success: false, error: errData.error || 'Failed to create workspace' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      loadSecureKeys: async () => {
        const { rememberKeys } = get();
        if (!rememberKeys) return; // Do not auto-load saved keys if rememberKeys is disabled

        const ipc = (window as any).nyxIPC;
        if (ipc && typeof ipc.invoke === 'function') {
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
          } catch (err) {
            console.error('[Store] Failed to retrieve secure keys on mount:', err);
          }
        }
      },

      refreshStatuses: async () => {
        const providers: ModelProvider[] = ['gemini', 'openrouter', 'nvidia', 'opencode', 'pollinations', 'nyx-native'];
        const newStatuses: Record<string, 'online' | 'offline' | 'no-key'> = {};
        
        try {
          // Check local models status
          const nativeRes = await fetchWithAuth('/api/nyx/local-models/status').catch(() => null);
          const nativeOnline = nativeRes && nativeRes.ok && (await nativeRes.json()).activeModelId;
          newStatuses['nyx-native'] = nativeOnline ? 'online' : 'offline';

          // Pollinations is always online (public API)
          newStatuses['pollinations'] = 'online';

          // Check safeStorage vault configuration for cloud providers
          const vaultRes = await fetch('/api/vault/status').catch(() => null);
          if (vaultRes && vaultRes.ok) {
            const vaultStatus = await vaultRes.json();
            for (const p of providers) {
              if (['pollinations', 'nyx-native'].includes(p)) continue;
              const hasVaultKey = vaultStatus[p];
              const hasMemoryKey = !!get().apiKeys[p];
              
              if (hasVaultKey || hasMemoryKey) {
                newStatuses[p] = 'online';
              } else {
                newStatuses[p] = 'no-key';
              }
            }
          } else {
            // Fallback: check key memory store
            for (const p of providers) {
              if (['pollinations', 'nyx-native'].includes(p)) continue;
              newStatuses[p] = get().apiKeys[p] ? 'online' : 'no-key';
            }
          }
          set({ statuses: newStatuses });
        } catch (e) {
          console.warn('[Store] Status checks failed:', e);
        }
      },
    }),
    {
      name: 'nyx-global-state',
      partialize: (state) => ({
        activeMode: state.activeMode,
        localModelsEnabled: state.localModelsEnabled,
        modelSettings: state.modelSettings,
        models: state.models,
        privacyMode: state.privacyMode,
        rememberKeys: state.rememberKeys,
      }),
    }
  )
);
