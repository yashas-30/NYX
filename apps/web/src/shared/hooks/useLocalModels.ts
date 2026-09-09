import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useModelStore } from '@core/stores/useModelStore';

export interface LocalModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  specs: {
    contextWindow: string;
    maxOutput: string;
    modality: string;
  };
  status: string;
  capabilities?: {
    vision: boolean;
    reasoning: boolean;
  };
  [key: string]: any;
}

export interface LocalServerStatus {
  running: boolean;
  model_id: string | null;
  port: number | null;
}

export function isModelLoaded(modelId?: string | null, loadedModel?: string | null): boolean {
  if (!loadedModel || !modelId) return false;
  if (loadedModel === modelId) return true;
  const n1 = modelId.toLowerCase().replace(/\\/g, '/');
  const n2 = loadedModel.toLowerCase().replace(/\\/g, '/');
  if (n1 === n2) return true;
  const b1 = n1.split('/').pop() || n1;
  const b2 = n2.split('/').pop() || n2;
  if (b1 === b2) return true;
  const stripExt = (s: string) => s.replace(/\.(gguf|bin|safetensors|pt|pth|onnx|ckpt)$/i, '');
  const s1 = stripExt(b1);
  const s2 = stripExt(b2);
  if (s1 === s2) return true;

  return false;
}

export function formatContextWindow(
  rawVal: number | string | undefined | null,
  nameFallback: string
): string {
  if (typeof rawVal === 'number' && rawVal > 0) {
    if (rawVal >= 1_048_576) {
      return `${Math.round(rawVal / 1_048_576)}M`;
    } else if (rawVal >= 1000) {
      return `${Math.round(rawVal / 1024)}K`;
    } else {
      return `${rawVal}`;
    }
  }

  if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
    const trimmed = rawVal.trim().toUpperCase();
    if (trimmed.endsWith('K') || trimmed.endsWith('M')) {
      return trimmed;
    }
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return formatContextWindow(parsed, nameFallback);
    }
  }

  return inferModelSpecs(nameFallback).contextWindow;
}

export function findLocalModelDef(modelId?: string | null, localModels?: any[]): any {
  if (!modelId || !localModels || !localModels.length) return null;
  const cleanId = modelId.replace(/\\/g, '/');
  const leafId = cleanId.split('/').pop() || cleanId;
  const stripExt = (s: string) => s.replace(/\.(gguf|bin|safetensors|pt|pth|onnx|ckpt)$/i, '');
  const baseId = stripExt(leafId).toLowerCase();

  return (
    localModels.find((m: any) => {
      if (!m) return false;
      if (m.id === modelId || m.name === modelId) return true;
      const mClean = (m.id || '').replace(/\\/g, '/');
      const mLeaf = mClean.split('/').pop() || mClean;
      if (mClean === cleanId || mLeaf === leafId) return true;
      if (stripExt(mLeaf).toLowerCase() === baseId) return true;
      if (m.name && stripExt(m.name).toLowerCase() === baseId) return true;
      return false;
    }) || null
  );
}

export function inferModelSpecs(idOrName: string) {
  const name = idOrName.toLowerCase();
  let contextWindow = '';
  let maxOutput = 'N/A';
  let modality = 'Text';

  // 1. Check for explicit context annotations in filename (e.g. -1M-, -128k-, -32k-, -16k-)
  const cleanName = name.replace(/_q\d+_[a-z0-9_]+/i, '').replace(/_k_[a-z0-9]+/i, '');
  const mMatch = cleanName.match(/(?:[\-_.]|^)(\d+)m(?:[\-_.]|$)/i);
  const kMatch = cleanName.match(/(?:[\-_.]|^)(\d+)k(?:[\-_.]|$)/i);
  if (mMatch) {
    const num = parseInt(mMatch[1], 10);
    if (num >= 1 && num <= 16) {
      contextWindow = `${num}M`;
    }
  } else if (kMatch) {
    const num = parseInt(kMatch[1], 10);
    if (num >= 1 && num <= 2048) {
      contextWindow = `${num}K`;
    }
  }

  // 2. Default clean context window if not indicated in filename
  if (!contextWindow) {
    contextWindow = '32K';
    maxOutput = '4K';
  }

  // Extract quantization (e.g. Q4_K_M, Q8_0, f16, safetensors, pt, onnx)
  const quantMatch =
    name.match(/[-_.](q[0-9a-z_]+|f16|f32)\.gguf$/i) ||
    name.match(/\.(safetensors|bin|ckpt|pt|pth|onnx)$/i);

  let quantization = quantMatch ? quantMatch[1].toUpperCase() : 'Unknown';
  if (
    quantization === 'SAFETENSORS' ||
    quantization === 'BIN' ||
    quantization === 'PT' ||
    quantization === 'PTH'
  ) {
    quantization = 'PyTorch / FP16';
  } else if (quantization === 'ONNX') {
    quantization = 'ONNX Runtime';
  } else if (quantization === 'CKPT') {
    quantization = 'Diffusers Checkpoint';
  } else if (
    quantization === 'UNKNOWN' &&
    (name.includes('instruct') || name.includes('seed') || name.includes('model'))
  ) {
    quantization = 'HuggingFace Model';
  }

  return {
    quantization,
    contextWindow,
    maxOutput,
    modality,
    capabilities: {
      vision: false,
      reasoning: false,
      audio: false,
      tools: false,
    },
  };
}

/**
 * Companion/support file names that are NOT standalone loadable models.
 * These files are required by image/diffusion models but must not appear
 * as separate entries in the model library.
 */
const COMPANION_FILE_PREFIXES = [
  'ae.',
  'vae.',
  'clip_l',
  'clip_g',
  'clip-l',
  'clip-g',
  't5xxl',
  't5-xxl',
  't5_xxl',
];
const COMPANION_FILE_EXACT = ['ae.safetensors', 'vae.safetensors'];

export function isCompanionSupportFile(name?: string | null): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase().replace(/\\/g, '/');
  const basename = normalized.split('/').pop() || normalized;
  const dir = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  const dirSegments = dir.split('/');

  // 1. Directory-level companion detection (e.g. MTP/, draft/, mmproj/, projector/, etc.)
  if (
    dirSegments.some((seg) =>
      ['mtp', 'draft', 'drafts', 'mmproj', 'projector', 'projectors', 'vae', 'clip'].includes(seg)
    )
  ) {
    return true;
  }

  // 2. Vision projector support files
  if (
    basename.includes('mmproj') ||
    basename.includes('projector') ||
    basename.includes('vision_encoder') ||
    basename.includes('vision-encoder') ||
    basename.includes('clip-vision') ||
    basename.includes('clip_vision')
  ) {
    return true;
  }

  // 3. Audio projector support files
  if (
    basename.includes('audio-projector') ||
    basename.includes('audio_projector') ||
    basename.includes('audio-encoder') ||
    basename.includes('audio_encoder') ||
    basename.includes('whisper') ||
    basename.includes('speech_encoder')
  ) {
    return true;
  }

  // 4. Draft & MTP speculative decoding files
  if (
    basename.startsWith('draft-') ||
    basename.startsWith('draft_') ||
    basename.startsWith('mtp-') ||
    basename.startsWith('mtp_') ||
    basename.includes('-draft') ||
    basename.includes('_draft') ||
    basename.includes('-mtp') ||
    basename.includes('_mtp') ||
    basename.endsWith('.mtp') ||
    basename.includes('.mtp.')
  ) {
    return true;
  }

  // 5. Importance matrices and metadata utilities
  if (basename.includes('imatrix')) {
    return true;
  }

  // 6. Diffusion support files
  if (COMPANION_FILE_EXACT.includes(basename)) return true;
  if (COMPANION_FILE_PREFIXES.some((p) => basename.startsWith(p))) return true;
  // e.g. "flux1-vae.safetensors"
  if (basename.endsWith('-vae.safetensors') && !basename.includes('text')) return true;

  return false;
}

/** List all installed local GGUF models. Polls every 5 s while enabled. */
export function useLocalModels(enabled: boolean = true) {
  return useQuery({
    queryKey: ['localModels'],
    queryFn: async () => {
      try {
        const models: any[] = await invoke('list_local_models');
        const formattedModels = models
          // Client-side defense: exclude companion support files even if backend
          // sends them (e.g. during a transition after update)
          .filter((m) => !isCompanionSupportFile(m.name) && !isCompanionSupportFile(m.id))
          .map((m) => {
            const rawCtx = m.context_length || m.contextLength || m.max_context_length;
            const contextWindow = formatContextWindow(rawCtx, m.name);
            const specs = inferModelSpecs(m.name);

            const isVision = m.supports_vision === true || specs.capabilities?.vision === true;
            const isAudio = m.supports_audio === true || specs.capabilities?.audio === true;
            const isTools = m.supports_tools === true || specs.capabilities?.tools === true;
            const isReasoning = m.supports_reasoning === true;
            const modality =
              m.model_type === 'text-to-image'
                ? 'Text-to-Image'
                : isVision && isAudio
                  ? 'Omni (Text + Vision + Audio)'
                  : isVision
                    ? 'Text + Vision'
                    : isAudio
                      ? 'Text + Audio'
                      : specs.modality || 'Text';

            return {
              ...m,
              specs: {
                ...specs,
                modality,
                contextWindow,
                size: (m.size_bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
              },
              // Prefer backend-derived capability flags; fall back to inferModelSpecs only for
              // imageGen / onnx / pytorch which are not yet surfaced by the backend.
              capabilities: {
                ...specs.capabilities,
                reasoning: isReasoning,
                vision: isVision,
                audio: isAudio,
                tools: isTools,
                toolCalling: isTools,
              },
              status: m.status || 'completed',
              features: [
                'Local',
                m.model_type === 'text-to-image'
                  ? 'Diffusion'
                  : m.model_type === 'onnx'
                    ? 'ONNX'
                    : m.model_type === 'pytorch'
                      ? 'PyTorch'
                      : 'GGUF',
              ],
              pros: ['Private', 'Fast', 'No Cloud'],
              cons: ['Requires RAM/VRAM'],
            };
          });
        return { models: formattedModels };
      } catch (e) {
        console.error('Failed to fetch local models', e);
        return { models: [] };
      }
    },
    // Refetch every 3s so downloaded models appear immediately in the library
    refetchInterval: enabled ? 3_000 : false,
    staleTime: 0,
    gcTime: 300_000,
    enabled,
  });
}

/**
 * Real-time local server status.
 * Polls `check_local_server_status` every 3 s — lightweight HTTP head-check
 * to 127.0.0.1:8080/health so the panel can show green/amber/red dot immediately.
 */
export function useLocalServerStatus() {
  return useQuery<LocalServerStatus>({
    queryKey: ['localServerStatus'],
    queryFn: async () => {
      try {
        const status = await invoke<LocalServerStatus>('check_local_server_status');
        const activeModel = status?.model_id || (status as any)?.active_model_id;
        if (status?.running && activeModel) {
          useModelStore.getState().setLoadedLocalModel(activeModel);
        } else if (!status?.running) {
          useModelStore.getState().setLoadedLocalModel(null);
        }
        return status;
      } catch {
        useModelStore.getState().setLoadedLocalModel(null);
        return { running: false, model_id: null, port: null };
      }
    },
    refetchInterval: 3_000,
    // Always poll — the panel needs to know server state even when not open
    enabled: true,
  });
}
