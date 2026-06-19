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
}

export interface ToolPermissions {
  autoApproveAll: boolean;
  autoApproveTools: string[];
}

const DEFAULT_CHAT_SETTINGS: ModelSettings = {
  temperature: 0.7,
  maxTokens: 8192,
  topP: 0.95,
  topK: 40,
  gpuLayers: 99,
  threads: 4,
  contextSize: 2048,
  batchSize: 512,
  repeatPenalty: 1.1,
  mirostat: 0,
  antigravity: true,
  maxContextTokens: 32000,
  preservationTurns: 6,
  contextMode: 'prune',
};

const DEFAULT_CODER_SETTINGS: ModelSettings = {
  temperature: 0.2,
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
  maxContextTokens: 64000,
  preservationTurns: 10,
  contextMode: 'prune',
};

const DEFAULT_TOOL_PERMISSIONS: ToolPermissions = {
  autoApproveAll: false,
  autoApproveTools: [],
};

interface SettingsState {
  chatSettings: ModelSettings;
  coderSettings: ModelSettings;
  toolPermissions: ToolPermissions;

  // Actions
  setChatSettings: (settings: ModelSettings) => void;
  setCoderSettings: (settings: ModelSettings) => void;
  updateChatSettings: (settings: Partial<ModelSettings>) => void;
  updateCoderSettings: (settings: Partial<ModelSettings>) => void;
  updateToolPermissions: (permissions: Partial<ToolPermissions>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const getInitialChatSettings = (): ModelSettings => {
    const saved = localStorage.getItem('nyx_chat_settings');
    if (saved) {
      try {
        return { ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(saved) };
      } catch {}
    }
    return DEFAULT_CHAT_SETTINGS;
  };

  const getInitialCoderSettings = (): ModelSettings => {
    const saved = localStorage.getItem('nyx_coder_settings');
    if (saved) {
      try {
        return { ...DEFAULT_CODER_SETTINGS, ...JSON.parse(saved) };
      } catch {}
    }
    return DEFAULT_CODER_SETTINGS;
  };

  const getInitialToolPermissions = (): ToolPermissions => {
    const saved = localStorage.getItem('nyx_tool_permissions');
    if (saved) {
      try {
        return { ...DEFAULT_TOOL_PERMISSIONS, ...JSON.parse(saved) };
      } catch {}
    }
    return DEFAULT_TOOL_PERMISSIONS;
  };

  return {
    chatSettings: getInitialChatSettings(),
    coderSettings: getInitialCoderSettings(),
    toolPermissions: getInitialToolPermissions(),

    setChatSettings: (settings) => {
      set({ chatSettings: settings });
      localStorage.setItem('nyx_chat_settings', JSON.stringify(settings));
    },

    setCoderSettings: (settings) => {
      set({ coderSettings: settings });
      localStorage.setItem('nyx_coder_settings', JSON.stringify(settings));
    },

    updateChatSettings: (updates) => {
      set((state) => {
        const next = { ...state.chatSettings, ...updates };
        localStorage.setItem('nyx_chat_settings', JSON.stringify(next));
        return { chatSettings: next };
      });
    },

    updateCoderSettings: (updates) => {
      set((state) => {
        const next = { ...state.coderSettings, ...updates };
        localStorage.setItem('nyx_coder_settings', JSON.stringify(next));
        return { coderSettings: next };
      });
    },

    updateToolPermissions: (updates) => {
      set((state) => {
        const next = { ...state.toolPermissions, ...updates };
        localStorage.setItem('nyx_tool_permissions', JSON.stringify(next));
        return { toolPermissions: next };
      });
    },
  };
});
