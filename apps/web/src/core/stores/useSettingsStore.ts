import { create } from 'zustand';

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
  maxContextTokens?: number;
  preservationTurns?: number;
  contextMode?: 'off' | 'prune' | 'summarize';
  kvCacheType?: 'auto' | 'f16' | 'q8_0' | 'q4_0' | 'q4_1';
}

const DEFAULT_CHAT_SETTINGS: ModelSettings = {
  temperature: 0.7,
  maxTokens: 8192,
  topP: 0.95,
  topK: 40,
  gpuLayers: 0,
  threads: 4,
  contextSize: 4096,
  batchSize: 512,
  repeatPenalty: 1.1,
  mirostat: 0,
  kvCacheType: 'auto',
  antigravity: true,
  maxContextTokens: 32000,
  preservationTurns: 6,
  contextMode: 'prune',
};



interface SettingsState {
  chatSettings: ModelSettings;

  // Actions
  setChatSettings: (settings: ModelSettings) => void;
  updateChatSettings: (settings: Partial<ModelSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const getInitialChatSettings = (): ModelSettings => {
    const saved = localStorage.getItem('nyx_chat_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Force context size to 4096 on startup regardless of what was saved
        parsed.contextSize = 4096;
        return { ...DEFAULT_CHAT_SETTINGS, ...parsed };
      } catch {}
    }
    return DEFAULT_CHAT_SETTINGS;
  };

  return {
    chatSettings: getInitialChatSettings(),

    setChatSettings: (settings) => {
      set({ chatSettings: settings });
      localStorage.setItem('nyx_chat_settings', JSON.stringify(settings));
    },

    updateChatSettings: (updates) => {
      set((state) => {
        const next = { ...state.chatSettings, ...updates };
        localStorage.setItem('nyx_chat_settings', JSON.stringify(next));
        return { chatSettings: next };
      });
    },
  };
});
