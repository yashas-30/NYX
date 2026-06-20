import { create } from 'zustand';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface ModelState {
  modelsState: Record<'chat' | 'coder', string>;
  localModelsEnabled: boolean;
  localLibraryModels: any[];
  isLoading: boolean;

  // Actions
  setModels: (models: Record<'chat' | 'coder', string>) => void;
  setModel: (activeMode: 'chat' | 'coder' | 'settings' | 'registry', mid: string) => void;
  setLocalModelsEnabled: (enabled: boolean) => void;
  loadLocalLibraryModels: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => {
  return {
    modelsState: {
      chat: '',
      coder: '',
    },
    localModelsEnabled: false,
    localLibraryModels: [],
    isLoading: false,

    setModels: (models) => {
      set({ modelsState: models });
      localStorage.setItem('nyx_coder_models_v3', JSON.stringify(models));
    },

    setModel: (activeMode, mid) => {
      const targetKey = activeMode === 'chat' ? 'chat' : 'coder';
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
      if (!enabled) {
        set({ localLibraryModels: [] });
      }
    },

    loadLocalLibraryModels: async () => {
      const { localModelsEnabled } = get();
      if (!localModelsEnabled) {
        set({ localLibraryModels: [] });
        return;
      }

      set({ isLoading: true });
      try {
        const res = await fetchWithAuth('/api/v1/nyx/local-models');
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) {
            const completed = data.models
              .filter((m: any) => m.status === 'completed' || m.status === 'downloading')
              .map((m: any) => ({
                id: m.id,
                name: m.name,
                provider: 'nyx-native',
                description: m.description || `Local GGUF model (${m.size || ''})`,
                specs: {
                  contextWindow: m.contextLength || '8K',
                  trainingData: 'N/A',
                  maxOutput: 'N/A',
                  modality: 'Text',
                },
                status: m.status,
              }));
            set({ localLibraryModels: completed });
          }
        }
      } catch (err: any) {
        console.error('[useModelStore] Failed to load local models:', err);
      } finally {
        set({ isLoading: false });
      }
    },
  };
});
