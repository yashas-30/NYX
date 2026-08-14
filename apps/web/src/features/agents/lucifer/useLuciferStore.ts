import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ── Model Capability Card ──────────────────────────────────────────────────────

export interface ModelCapabilityCard {
  modelId: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsAudio: boolean;
  supportsStreaming: boolean;
  trainingCutoff?: string;
  pricing?: {
    inputPer1MTokens?: number;
    outputPer1MTokens?: number;
    currency?: string;
  };
  latencyClass?: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  description?: string;
  fetchedAt: number;
}

// ── Turn Analysis ─────────────────────────────────────────────────────────────

export interface LuciferTurnAnalysis {
  intent:
    | 'web_search'
    | 'memory_rag'
    | 'image_generation'
    | 'code_engineering'
    | 'conversational'
    | 'voice_synthesis'
    | 'model_capabilities';
  requires_search: boolean;
  requires_memory: boolean;
  requires_image_gen: boolean;
  requires_voice: boolean;
  /** True when the current message is a code/engineering task. */
  requires_code: boolean;
  /** All active tool names for this turn — supports multi-intent execution. */
  requires_tools: string[];
  is_local_model: boolean;
  confidence: number;
  /** True if the user is referencing or asking about the previous assistant response. */
  refers_to_previous_response?: boolean;
  /** First 400 chars of the previous assistant response, for persona injection. */
  previous_response_snippet?: string;
  /** Original query rewritten to include resolved context from conversation thread. */
  decontextualized_query?: string;
  /**
   * Key topic words extracted from the last 5 user turns.
   * Used for follow-up search enrichment.
   */
  topic_thread?: string[];
  /**
   * Map of pronoun → resolved entity from conversation history.
   * e.g. { "it": "React 19", "he": "Dan Abramov" }
   */
  resolved_entities?: Record<string, string>;
  /**
   * How many consecutive turns have been about the same search topic.
   * Drives search follow-up re-enrichment depth.
   */
  search_follow_up_depth?: number;
}


// ── Analysis Cache Entry ───────────────────────────────────────────────────────

interface AnalysisCacheEntry {
  /** SHA-ish hash of the last message text + provider string, used for cache keying. */
  hash: string;
  result: LuciferTurnAnalysis;
}

// ── Log Entry ─────────────────────────────────────────────────────────────────

export interface LuciferLogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'tool_call' | 'tool_result' | 'error' | 'image_req' | 'voice_req' | 'capability_fetch';
  title: string;
  details?: string;
}

// ── Store State ───────────────────────────────────────────────────────────────

interface LuciferState {
  isLuciferActive: boolean;
  currentAnalysis: LuciferTurnAnalysis | null;
  /** In-memory cache for the last analysis result — eliminates double analysis per turn. */
  analysisCache: AnalysisCacheEntry | null;
  activeToolName: string | null;
  logs: LuciferLogEntry[];
  lastImagePrompt: string | null;
  lastVoiceText: string | null;
  /** Capability card for the currently active model. */
  modelCapabilityCard: ModelCapabilityCard | null;

  setLuciferActive: (active: boolean) => void;
  setAnalysis: (analysis: LuciferTurnAnalysis | null) => void;
  setAnalysisCache: (entry: AnalysisCacheEntry | null) => void;
  setActiveTool: (tool: string | null) => void;
  addLog: (entry: Omit<LuciferLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setImagePrompt: (prompt: string | null) => void;
  setVoiceText: (text: string | null) => void;
  setModelCapabilityCard: (card: ModelCapabilityCard | null) => void;
  clearState: () => void;
}

const MAX_LOGS = 100;

export const useLuciferStore = create<LuciferState>()(
  persist(
    (set) => ({
      isLuciferActive: true,
      currentAnalysis: null,
      analysisCache: null,
      activeToolName: null,
      logs: [],
      lastImagePrompt: null,
      lastVoiceText: null,
      modelCapabilityCard: null,

      setLuciferActive: (active) => set({ isLuciferActive: active }),
      setAnalysis: (analysis) => set({ currentAnalysis: analysis }),
      setAnalysisCache: (entry) => set({ analysisCache: entry }),
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
      setModelCapabilityCard: (card) => set({ modelCapabilityCard: card }),
      clearState: () =>
        set({
          currentAnalysis: null,
          analysisCache: null,
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
