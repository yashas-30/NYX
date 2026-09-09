import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  inferModelSpecs,
  formatContextWindow,
  isCompanionSupportFile,
} from '@shared/hooks/useLocalModels';

interface ModelState {
  modelsState: { chat: string };
  localModelsEnabled: boolean;
  localLibraryModels: any[];
  isLoading: boolean;

  loadedLocalModel: string | null;
  /** True when the currently loaded local model is a text-to-image generation model */
  isActiveModelImageGen: boolean;

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
    isActiveModelImageGen: false,
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
      const lib = get().localLibraryModels;
      const def = modelId ? lib.find((m: any) => m.id === modelId) : null;
      const imageGen =
        !!def?.capabilities?.imageGen ||
        // Fallback: check known image-model keywords in the ID itself
        (!!modelId &&
          [
            'text_encoder',
            'text-encoder',
            'vae',
            'transformer',
            'flux',
            'diffusion',
            'stable',
            'sdxl',
            'sd3',
            'sd1',
            'sd2',
            'controlnet',
            'lora',
            'unet',
          ].some((kw) => modelId.toLowerCase().includes(kw)));
      set({ loadedLocalModel: modelId, isActiveModelImageGen: imageGen });
    },

    loadLocalLibraryModels: async () => {
      set({ isLoading: true });
      try {
        let modelsData: any[] = [];

        if (
          typeof window !== 'undefined' &&
          ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
        ) {
          const tauriModels: any = await invoke('list_local_models');
          modelsData = tauriModels || [];
        }

        const completed = modelsData
          .filter(
            (m: any) =>
              (!m.status || m.status === 'completed') &&
              m.model_type !== 'vision' &&
              !m.name?.toLowerCase().includes('mmproj') &&
              !m.id?.toLowerCase().includes('mmproj') &&
              !isCompanionSupportFile(m.name) &&
              !isCompanionSupportFile(m.id)
          )
          .map((m: any) => {
            const rawCtx = m.context_length || m.contextLength || m.max_context_length;
            const contextWindow = formatContextWindow(rawCtx, m.name);

            const nameLower = m.name?.toLowerCase() || '';
            const repoIdLower = m.repo_id?.toLowerCase() || '';
            const searchStr = `${nameLower} ${repoIdLower}`;

            const isImageGen =
              m.model_type === 'text-to-image' || // Rust backend sets this for diffusion models by name/type
              searchStr.includes('flux') ||
              searchStr.includes('diffusion') ||
              searchStr.includes('diffus') ||
              searchStr.includes('sdxl') ||
              searchStr.includes('sd_') ||
              searchStr.includes('sd3') ||
              searchStr.includes('sd-') ||
              searchStr.includes('sd1') ||
              searchStr.includes('sd2') ||
              searchStr.includes('sd5') ||
              searchStr.includes('stable') ||
              searchStr.includes('turbo') ||
              searchStr.includes('inpainting') ||
              searchStr.includes('pix2pix') ||
              searchStr.includes('text-to-image') ||
              searchStr.includes('image-gen') ||
              searchStr.includes('midjourney') ||
              searchStr.includes('playground') ||
              searchStr.includes('wan') ||
              searchStr.includes('hunyuan') ||
              searchStr.includes('kolors') ||
              searchStr.includes('cogvideo') ||
              searchStr.includes('controlnet') ||
              searchStr.includes('lora') ||
              searchStr.includes('v1-5') ||
              searchStr.includes('v2-1') ||
              // Standalone diffusers subcomponents (text_encoder, vae, transformer folders)
              searchStr.includes('text_encoder') ||
              searchStr.includes('text-encoder') ||
              searchStr.includes('vae') ||
              (searchStr.includes('transformer') && !searchStr.includes('sentence-transformer')) ||
              m.id?.endsWith('.ckpt');

            const isVision = m.supports_vision === true || m.has_mmproj === true;
            const isAudio = m.supports_audio === true;
            const isTools = m.supports_tools === true;
            const isReasoning = m.supports_reasoning === true;

            const isOnnx = m.model_type === 'onnx';
            const isPytorch = m.model_type === 'pytorch';

            const modality = isImageGen
              ? 'Text-to-Image'
              : isVision && isAudio
                ? 'Omni (Text + Vision + Audio)'
                : isVision
                  ? 'Text + Vision'
                  : isAudio
                    ? 'Text + Audio'
                    : isOnnx
                      ? 'ONNX'
                      : isPytorch
                        ? 'PyTorch Native'
                        : 'Text';

            return {
              id: m.id,
              name: m.name,
              provider: 'nyx-native',
              description: m.description || `Local model (${m.size || ''})`,
              context_length: rawCtx || m.context_length,
              supports_reasoning: isReasoning,
              supports_vision: isVision,
              supports_audio: isAudio,
              supports_tools: isTools,
              filePath: m.filePath || m.path,
              specs: {
                contextWindow: isImageGen || isOnnx || isPytorch ? 'N/A' : contextWindow,
                maxOutput: 'N/A',
                modality,
              },
              capabilities: {
                vision: isVision,
                reasoning: isReasoning,
                toolCalling: isTools,
                tools: isTools,
                audio: isAudio,
                imageGen: isImageGen,
                onnx: isOnnx,
                pytorch: isPytorch,
              },
              model_type:
                m.model_type ||
                (isImageGen
                  ? 'text-to-image'
                  : isOnnx
                    ? 'onnx'
                    : isPytorch
                      ? 'pytorch'
                      : 'text-generation'),
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

// Immediately trigger local model loading on store instantiation
useModelStore.getState().loadLocalLibraryModels();

// Listen for download completion events globally to refresh model store automatically
if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
  import('@tauri-apps/api/event')
    .then(({ listen }) => {
      listen('hf-download-complete', () => {
        useModelStore.getState().loadLocalLibraryModels();
      });
      listen('llm-download-complete', () => {
        useModelStore.getState().loadLocalLibraryModels();
      });
    })
    .catch(() => {});
}
