import { create } from 'zustand';
import type { ChatMessage, TelemetryMetrics } from '@nyx/shared/types';

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  metrics: TelemetryMetrics;
  suggestedPrompts: string[];

  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setMetrics: (metrics: TelemetryMetrics) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  clearChat: () => void;
}

const defaultMetrics: TelemetryMetrics = {
  latency: 0,
  tokens: 0,
  tps: 0,
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  metrics: defaultMetrics,
  suggestedPrompts: [],

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