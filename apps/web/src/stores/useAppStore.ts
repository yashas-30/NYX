import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelOption, AISettings, Provider } from '@nyx/shared/types';
import { useNyxStore } from '@src/shared/store/useNyxStore';

interface AppState {
  apiKeys: Record<Provider, string>;
  setApiKey: (provider: Provider, key: string) => void;
  clearApiKey: (provider: Provider) => void;

  selectedModel: ModelOption | null;
  setSelectedModel: (model: ModelOption | null) => void;

  settings: AISettings;
  updateSettings: (settings: Partial<AISettings>) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;

  activeTab: 'chat' | 'compare' | 'registry' | 'settings';
  setActiveTab: (tab: 'chat' | 'compare' | 'registry' | 'settings') => void;

  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
  toggleWebSearch: () => void;
  toggleCodebaseKnowledge: () => void;
}

const defaultSettings: AISettings = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      apiKeys: {} as Record<Provider, string>,
      setApiKey: (provider, key) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }));
        try {
          useNyxStore.getState().updateApiKey(provider, key);
        } catch {
          // Safe no-op during initialization
        }
      },
      clearApiKey: (provider) => {
        set((state) => {
          const next = { ...state.apiKeys };
          delete next[provider];
          return { apiKeys: next };
        });
        try {
          useNyxStore.getState().updateApiKey(provider, '');
        } catch {
          // Safe no-op
        }
      },

      selectedModel: null,
      setSelectedModel: (model) => {
        set({ selectedModel: model });
        if (model) {
          try {
            useNyxStore.getState().setCurrentModel(model);
          } catch {
            // Safe no-op
          }
        }
      },

      settings: defaultSettings,
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
        try {
          useNyxStore.getState().updateModelSettings({
            temperature: newSettings.temperature,
            maxTokens: newSettings.maxTokens,
            topP: newSettings.topP,
          });
        } catch {
          // Safe no-op
        }
      },

      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      activeTab: 'chat',
      setActiveTab: (tab) => set({ activeTab: tab }),

      webSearchEnabled: false,
      codebaseKnowledgeEnabled: true,
      toggleWebSearch: () =>
        set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),
      toggleCodebaseKnowledge: () =>
        set((state) => ({
          codebaseKnowledgeEnabled: !state.codebaseKnowledgeEnabled,
        })),
    }),
    {
      name: 'nyx-app-storage',
      partialize: (state) => ({
        apiKeys: state.apiKeys,
        settings: state.settings,
        sidebarOpen: state.sidebarOpen,
        webSearchEnabled: state.webSearchEnabled,
        codebaseKnowledgeEnabled: state.codebaseKnowledgeEnabled,
      }),
    }
  )
);