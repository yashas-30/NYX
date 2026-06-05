import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelOption, AISettings, Provider } from '@nyx/shared/types';

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
      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),
      clearApiKey: (provider) =>
        set((state) => {
          const next = { ...state.apiKeys };
          delete next[provider];
          return { apiKeys: next };
        }),

      selectedModel: null,
      setSelectedModel: (model) => set({ selectedModel: model }),

      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

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