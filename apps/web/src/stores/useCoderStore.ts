import { create } from 'zustand';
import type { ModelOption, AISettings, Provider } from '@nyx/shared/types';
import type { ChatMessage, TelemetryMetrics } from '@nyx/shared/types';

interface CoderState {
  selectedModel: ModelOption | null;
  setSelectedModel: (model: ModelOption | null) => void;

  apiKeys: Record<Provider, string>;
  setApiKey: (provider: Provider, key: string) => void;
  clearApiKey: (provider: Provider) => void;

  settings: AISettings;
  updateSettings: (settings: Partial<AISettings>) => void;

  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
  toggleWebSearch: () => void;
  toggleCodebaseKnowledge: () => void;

  messages: ChatMessage[];
  isLoading: boolean;
  metrics: TelemetryMetrics;
  suggestedPrompts: string[];
  activeCoderSessionId: string | null;
  setActiveCoderSessionId: (id: string | null) => void;

  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setMetrics: (metrics: TelemetryMetrics) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  clearChat: () => void;
}

const defaultSettings: AISettings = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
};

const defaultMetrics: TelemetryMetrics = {
  latency: 0,
  tokens: 0,
  tps: 0,
};

export const useCoderStore = create<CoderState>((set) => ({
  selectedModel: null,
  setSelectedModel: (model) => set({ selectedModel: model }),

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

  settings: defaultSettings,
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),

  webSearchEnabled: false,
  codebaseKnowledgeEnabled: true,
  toggleWebSearch: () =>
    set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),
  toggleCodebaseKnowledge: () =>
    set((state) => ({
      codebaseKnowledgeEnabled: !state.codebaseKnowledgeEnabled,
    })),

  messages: [],
  isLoading: false,
  metrics: defaultMetrics,
  suggestedPrompts: [],
  activeCoderSessionId: null,
  setActiveCoderSessionId: (id) => set({ activeCoderSessionId: id }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateLastMessage: (updater) =>
    set((state) => {
      const messages = [...state.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
        messages[lastIdx] = updater(messages[lastIdx]);
      }
      return { messages };
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setMetrics: (metrics) => set({ metrics }),
  setSuggestedPrompts: (prompts) => set({ suggestedPrompts: prompts }),
  clearChat: () =>
    set({
      messages: [],
      metrics: defaultMetrics,
      suggestedPrompts: [],
    }),
}));