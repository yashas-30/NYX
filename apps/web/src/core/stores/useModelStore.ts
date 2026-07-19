import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { inferModelSpecs } from '@shared/hooks/useLocalModels';

interface ModelState {
  modelsState: { chat: string };
  localModelsEnabled: boolean;
  localLibraryModels: any[];
  isLoading: boolean;

  loadedLocalModel: string | null;

  // Actions
  setModels: (models: { chat: string }) => void;
  setModel: (activeMode: 'chat' | 'settings' | 'registry', mid: string) => void;
  setLocalModelsEnabled: (enabled: boolean) => void;
  setLoadedLocalModel: (modelId: string | null) => void;
  loadLocalLibraryModels: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => {
  return {
    modelsState: {
      chat: '',
    },
    localModelsEnabled: false,
    localLibraryModels: [],
    loadedLocalModel: null,
    isLoading: false,

    setModels: (models) => {
      set({ modelsState: models });
      localStorage.setItem('nyx_coder_models_v3', JSON.stringify(models));
    },

    setModel: (activeMode, mid) => {
      const targetKey = 'chat'; // Now exclusively chat
      set((state) => {
        const nextModels = {
          ...state.modelsState,
          [targetKey]: mid,
        };
        localStorage.setItem('nyx_coder_models_v3', JSON.stringify(nextModels));
        return { modelsState: nextModels };
      });
    },

    setLocalModelsEnabled: (enabled) => {
      set({ localModelsEnabled: enabled });
      localStorage.setItem('llm_ref_local_models_enabled', String(enabled));
      if (enabled) {
        get().loadLocalLibraryModels();
      }
      if (!enabled) {
        set({ localLibraryModels: [] });
      }
    },

    setLoadedLocalModel: (modelId) => {
      set({ loadedLocalModel: modelId });
    },

    loadLocalLibraryModels: async () => {
      set({ isLoading: true });
      try {
        let modelsData: any[] = [];

        const tauriModels: any = await invoke('list_local_models');
        modelsData = tauriModels || [];

        const completed = modelsData
          .filter((m: any) => !m.status || m.status === 'completed')
          .map((m: any) => {
            // Prefer the context_length the Rust backend resolved from the filename;
            // fall back to the JS inference if the field is absent (older binary).
            const contextWindow =
              m.context_length ||
              m.contextLength ||
              inferModelSpecs(m.name).contextWindow;

            const isVision =
              m.name?.toLowerCase().includes('vl') ||
              m.name?.toLowerCase().includes('vision') ||
              m.name?.toLowerCase().includes('llava');

            const isReasoning =
              m.name?.toLowerCase().includes('r1') ||
              m.name?.toLowerCase().includes('reasoning') ||
              m.name?.toLowerCase().includes('thinking') ||
              m.name?.toLowerCase().includes('o1') ||
              m.name?.toLowerCase().includes('o3');

            return {
              id: m.id,
              name: m.name,
              provider: 'nyx-native',
              description: m.description || `Local GGUF model (${m.size || ''})`,
              specs: {
                contextWindow,
                maxOutput: 'N/A',
                modality: isVision ? 'Text + Vision' : 'Text',
              },
              capabilities: {
                vision: isVision,
                reasoning: isReasoning,
              },
              status: m.status,
            };
          });
        set({ localLibraryModels: completed });
      } catch (err: any) {
        console.error('[useModelStore] Failed to load local models:', err);
      } finally {
        set({ isLoading: false });
      }
    },
  };
});
