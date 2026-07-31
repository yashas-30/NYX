import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface LuciferTurnAnalysis {
  intent: 'web_search' | 'memory_rag' | 'image_generation' | 'code_engineering' | 'conversational' | 'voice_synthesis';
  requires_search: boolean;
  requires_memory: boolean;
  requires_image_gen: boolean;
  requires_voice: boolean;
  is_local_model: boolean;
  confidence: number;
}

export interface LuciferLogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'tool_call' | 'tool_result' | 'error' | 'image_req' | 'voice_req';
  title: string;
  details?: string;
}

interface LuciferState {
  isLuciferActive: boolean;
  currentAnalysis: LuciferTurnAnalysis | null;
  activeToolName: string | null;
  logs: LuciferLogEntry[];
  lastImagePrompt: string | null;
  lastVoiceText: string | null;

  setLuciferActive: (active: boolean) => void;
  setAnalysis: (analysis: LuciferTurnAnalysis | null) => void;
  setActiveTool: (tool: string | null) => void;
  addLog: (entry: Omit<LuciferLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setImagePrompt: (prompt: string | null) => void;
  setVoiceText: (text: string | null) => void;
  clearState: () => void;
}

const MAX_LOGS = 100;

export const useLuciferStore = create<LuciferState>()(
  persist(
    (set) => ({
      isLuciferActive: true,
      currentAnalysis: null,
      activeToolName: null,
      logs: [],
      lastImagePrompt: null,
      lastVoiceText: null,

      setLuciferActive: (active) => set({ isLuciferActive: active }),
      setAnalysis: (analysis) => set({ currentAnalysis: analysis }),
      setActiveTool: (tool) => set({ activeToolName: tool }),
      addLog: (entry) =>
        set((state) => ({
          logs: [
            ...state.logs.slice(-(MAX_LOGS - 1)),
            {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: Date.now(),
              ...entry,
            },
          ],
        })),
      clearLogs: () => set({ logs: [] }),
      setImagePrompt: (prompt) => set({ lastImagePrompt: prompt }),
      setVoiceText: (text) => set({ lastVoiceText: text }),
      clearState: () =>
        set({
          currentAnalysis: null,
          activeToolName: null,
          logs: [],
          lastImagePrompt: null,
          lastVoiceText: null,
        }),
    }),
    {
      name: 'nyx-lucifer-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ isLuciferActive: state.isLuciferActive }),
    }
  )
);
