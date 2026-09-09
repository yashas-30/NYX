// src/features/hf-explorer/lib/utils.ts
import type { ParsedModelId, QuantInfo } from '../types';

export function parseModelId(id: string): ParsedModelId {
  if (!id) return { creator: 'Community', name: 'Unknown Model' };
  const parts = id.split('/');
  return parts.length > 1
    ? { creator: parts[0], name: parts.slice(1).join('/') }
    : { creator: 'Community', name: id };
}

export function formatSize(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatCount(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function getRelativeTime(iso?: string): string {
  if (!iso) return '';
  try {
    const days = Math.round((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (Math.abs(days) > 30) return `Updated ${formatDate(iso)}`;
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return `Updated ${rtf.format(days, 'day')}`;
  } catch {
    return iso;
  }
}

export function getParameterCount(tags?: string[], numParameters?: number): string | null {
  if (numParameters && numParameters > 0) {
    if (numParameters >= 1_000_000_000) {
      const b = numParameters / 1_000_000_000;
      return b % 1 === 0 ? `${b}B` : `${parseFloat(b.toFixed(1))}B`;
    }
    if (numParameters >= 1_000_000) {
      const m = numParameters / 1_000_000;
      return m % 1 === 0 ? `${m}M` : `${parseFloat(m.toFixed(1))}M`;
    }
  }
  const safeTags = tags || [];
  const match = safeTags.find((t) => typeof t === 'string' && /^[\d.]+[BM]$/i.test(t));
  return match ? match.toUpperCase() : null;
}

export function extractQuantToken(filename: string): string {
  if (!filename) return '';
  // Extract standardized GGUF quant tokens (e.g., Q4_K_M, Q4_K_S, Q4_0, Q4_1, UD-Q4_K_XL, IQ4_XS, IQ4_NL, Q8_0, BF16, F16, etc.)
  const match = filename.match(
    /(?:^|[._-])((?:UD-)?(?:I?Q[1-8]_[A-Za-z0-9_]+|Q[1-8]_[0-9]|Q[1-8]_[KMSL]|Q[1-8][A-Za-z0-9_]*|F16|F32|BF16|FP16|FP32))(?:[._-]|\.gguf$)/i
  );
  if (match) {
    return match[1].toUpperCase();
  }
  // Fallback for simple tokens
  const simpleMatch = filename.match(/(?:^|[._-])(Q[1-8]|F16|BF16|F32)(?:[._-]|\.gguf$)/i);
  return simpleMatch ? simpleMatch[1].toUpperCase() : '';
}

export function parseQuantLabel(filename: string): QuantInfo {
  const quant = extractQuantToken(filename);
  let bits = '';
  const qUpper = quant.toUpperCase();
  if (qUpper === 'Q4_K_M') bits = '4.5 bpw';
  else if (qUpper === 'Q4_K_S') bits = '4.3 bpw';
  else if (qUpper === 'Q4_K_L') bits = '4.6 bpw';
  else if (qUpper.includes('Q4_K_XL')) bits = '4.9 bpw';
  else if (qUpper === 'IQ4_XS') bits = '4.25 bpw';
  else if (qUpper === 'IQ4_NL') bits = '4.5 bpw';
  else if (qUpper === 'Q5_K_M') bits = '5.5 bpw';
  else if (qUpper === 'Q5_K_S') bits = '5.3 bpw';
  else if (qUpper === 'Q6_K') bits = '6.6 bpw';
  else if (qUpper === 'Q8_0') bits = '8.0 bpw';
  else if (qUpper.includes('Q1') || qUpper.includes('IQ1')) bits = '1-bit';
  else if (qUpper.includes('Q2') || qUpper.includes('IQ2')) bits = '2-bit';
  else if (qUpper.includes('Q3') || qUpper.includes('IQ3')) bits = '3-bit';
  else if (qUpper.includes('Q4') || qUpper.includes('IQ4')) bits = '4-bit';
  else if (qUpper.includes('Q5') || qUpper.includes('IQ5')) bits = '5-bit';
  else if (qUpper.includes('Q6') || qUpper.includes('IQ6')) bits = '6-bit';
  else if (qUpper.includes('Q8') || qUpper.includes('IQ8')) bits = '8-bit';
  else if (qUpper.includes('F16') || qUpper.includes('BF16') || qUpper.includes('FP16'))
    bits = '16-bit';
  else if (qUpper.includes('F32') || qUpper.includes('FP32')) bits = '32-bit';

  return { quant: quant || 'Standard', bits };
}

export interface QuantDetails {
  quant: string;
  bits: string;
  quality: 'max' | 'high' | 'balanced' | 'compact' | 'extreme' | 'standard';
  qualityLabel: string;
  description: string;
}

export function parseQuantDetails(filename: string): QuantDetails {
  const quant = extractQuantToken(filename);
  const { bits } = parseQuantLabel(filename);
  const qUpper = quant.toUpperCase();

  let quality: QuantDetails['quality'] = 'standard';
  let qualityLabel = quant || 'Standard';
  let description = 'Model file weights.';

  if (qUpper.includes('F16') || qUpper.includes('BF16') || qUpper.includes('FP16')) {
    quality = 'max';
    qualityLabel = 'Uncompressed (16-bit)';
    description = 'Full precision floating-point weights without quantization.';
  } else if (qUpper === 'Q8_0' || qUpper.includes('Q8_')) {
    quality = 'max';
    qualityLabel = 'Max Quality (Near-Lossless)';
    description = 'Virtually indistinguishable from 16-bit float. Ideal if VRAM permits.';
  } else if (qUpper === 'Q6_K' || qUpper.includes('Q6_')) {
    quality = 'high';
    qualityLabel = 'Very High Quality';
    description = 'Minimal perplexity loss; excellent quality-to-size ratio.';
  } else if (qUpper === 'Q5_K_M' || qUpper.includes('Q5_K')) {
    quality = 'high';
    qualityLabel = 'High Quality (5-bit)';
    description = 'High precision 5-bit quantization with very low degradation.';
  } else if (qUpper === 'Q5_0' || qUpper === 'Q5_1') {
    quality = 'high';
    qualityLabel = 'Standard 5-bit';
    description = 'Solid 5-bit precision with moderate memory usage.';
  } else if (qUpper === 'Q4_K_M') {
    quality = 'balanced';
    qualityLabel = 'Recommended (Balanced Sweet Spot)';
    description =
      'Optimal sweet spot: exceptional balance between speed, size, and reasoning quality.';
  } else if (qUpper === 'Q4_K_S') {
    quality = 'balanced';
    qualityLabel = 'Balanced (Fast)';
    description = 'Slightly smaller, faster 4-bit quantization with minimal quality loss.';
  } else if (qUpper === 'Q4_K_L') {
    quality = 'balanced';
    qualityLabel = 'Balanced (High Precision)';
    description = 'Higher precision 4-bit quantization preserving attention weights.';
  } else if (qUpper.includes('Q4_K_XL')) {
    quality = 'balanced';
    qualityLabel = 'Extra-Large Dynamic 4-bit';
    description = 'Extended dynamic 4-bit quantization with heightened precision.';
  } else if (qUpper === 'Q4_0' || qUpper === 'Q4_1') {
    quality = 'balanced';
    qualityLabel = 'Standard 4-bit';
    description = 'Standard legacy 4-bit quantization.';
  } else if (qUpper.startsWith('IQ4')) {
    quality = 'compact';
    qualityLabel = 'Compact 4-bit (i-Matrix)';
    description = 'Importance matrix optimized 4-bit for reduced size.';
  } else if (qUpper.includes('Q3_') || qUpper.includes('IQ3')) {
    quality = 'compact';
    qualityLabel = 'Compact 3-bit';
    description = 'Noticeable compression to fit lower memory budgets.';
  } else if (qUpper.includes('Q2_') || qUpper.includes('IQ2')) {
    quality = 'extreme';
    qualityLabel = 'Extreme 2-bit';
    description = 'Maximum compression for very constrained hardware; expect accuracy reduction.';
  } else if (qUpper.includes('IQ1')) {
    quality = 'extreme';
    qualityLabel = 'Ultra 1-bit';
    description = 'Ultra-low bitwidth quantization.';
  }

  return {
    quant: quant || 'Standard',
    bits,
    quality,
    qualityLabel,
    description,
  };
}

export type HfFileCategory = 'model' | 'vision' | 'audio' | 'draft' | 'ignored';

export interface ClassifiedHfFile {
  category: HfFileCategory;
  companionType?: 'vision' | 'audio' | 'draft';
  label?: string;
}

/**
 * Classifies a file from a Hugging Face repository into a standalone model,
 * companion/support file (vision, audio, draft/mtp), or ignored non-model file.
 * Handles subdirectories (e.g. MTP/, draft/, mmproj/), naming conventions, and file structures.
 */
export function classifyHfFile(filename: string): ClassifiedHfFile {
  const norm = filename.toLowerCase().replace(/\\/g, '/');
  if (!norm.endsWith('.gguf')) {
    return { category: 'ignored' };
  }

  const basename = norm.split('/').pop() || norm;
  const dir = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '';
  const dirSegments = dir.split('/');

  // Directory-level companion detection
  const inMtpDir = dirSegments.some((s) => s === 'mtp' || s.includes('mtp'));
  const inDraftDir = dirSegments.some((s) => s === 'draft' || s.includes('draft'));
  const inVisionDir = dirSegments.some(
    (s) => s === 'mmproj' || s.includes('projector') || s === 'vision' || s === 'visual'
  );
  const inAudioDir = dirSegments.some((s) => s.includes('audio') || s.includes('whisper'));

  // Importance matrices / utilities
  if (basename.includes('imatrix')) {
    return { category: 'ignored' };
  }

  // 1. Audio Projectors & Encoders
  if (
    inAudioDir ||
    basename.includes('audio-projector') ||
    basename.includes('audio_projector') ||
    basename.includes('audio-encoder') ||
    basename.includes('audio_encoder') ||
    basename.includes('whisper') ||
    basename.includes('speech_encoder') ||
    basename.includes('speech-encoder') ||
    basename.includes('conformer') ||
    /(?:^|[._-])audio(?:[._-]|\.gguf$)/i.test(basename)
  ) {
    return {
      category: 'audio',
      companionType: 'audio',
      label: `Audio Projector (${basename})`,
    };
  }

  // 2. Draft / MTP speculative models
  if (
    inMtpDir ||
    inDraftDir ||
    basename.startsWith('draft-') ||
    basename.startsWith('draft_') ||
    basename.startsWith('mtp-') ||
    basename.startsWith('mtp_') ||
    basename.includes('-draft') ||
    basename.includes('_draft') ||
    basename.includes('-mtp') ||
    basename.includes('_mtp') ||
    basename.endsWith('.mtp.gguf') ||
    basename.includes('.mtp.') ||
    basename.includes('speculative')
  ) {
    const isMtp = inMtpDir || basename.includes('mtp');
    return {
      category: 'draft',
      companionType: 'draft',
      label: `${isMtp ? 'MTP Speculative Model' : 'Draft Model'} (${basename})`,
    };
  }

  // 3. Vision Projectors (mmproj, vision-tower, encoders, adapters, and precision-tagged vision companions)
  const isVisionProjector =
    inVisionDir ||
    basename.includes('mmproj') ||
    basename.includes('projector') ||
    basename.includes('vision_tower') ||
    basename.includes('vision-tower') ||
    basename.includes('vision_encoder') ||
    basename.includes('vision-encoder') ||
    basename.includes('image_encoder') ||
    basename.includes('image-encoder') ||
    basename.includes('image_adapter') ||
    basename.includes('image-adapter') ||
    basename.includes('resampler') ||
    basename.includes('siglip') ||
    basename.includes('clip-vision') ||
    basename.includes('clip_vision') ||
    basename.includes('clip-vit') ||
    basename.includes('clip_vit') ||
    /(?:^|[._-])(?:vision|visual|vit|clip)(?:[._-](?:f16|f32|bf16|fp16|fp32|q[0-9][a-z0-9_]*))(?:\.gguf$)/i.test(
      basename
    ) ||
    /^(?:vision|visual|vit|clip)\.gguf$/i.test(basename);

  if (isVisionProjector) {
    return {
      category: 'vision',
      companionType: 'vision',
      label: `Vision Projector (${basename})`,
    };
  }

  return { category: 'model' };
}

export interface CompanionFileInfo {
  file: { filename: string; size: number };
  type: 'vision' | 'audio' | 'draft';
  label: string;
  repoId?: string;
  isExternal?: boolean;
}

/**
 * Finds the best support file (vision mmproj, audio, draft) for a specific target model quantization.
 * If a Q4 model is selected, pairs with a Q4 mmproj when available.
 * Falls back to F16 only when no matching quantized support file exists in the repository.
 */
export function findMatchingSupportFile(
  companions: CompanionFileInfo[],
  targetQuantToken: string,
  type: 'vision' | 'audio' | 'draft'
): CompanionFileInfo | null {
  const candidates = companions.filter((c) => c.type === type);
  if (candidates.length === 0) return null;

  const targetUpper = targetQuantToken.toUpperCase();
  const targetFamily = targetUpper.match(/(?:UD-)?(I?Q[1-8]|F16|BF16)/i)?.[1]?.toUpperCase() || '';

  let bestCandidate: CompanionFileInfo = candidates[0];
  let bestScore = -1;

  for (const cand of candidates) {
    const fn = cand.file.filename.toUpperCase();
    let score = 0;

    if (targetUpper && fn.includes(targetUpper)) {
      // Exact match e.g. Q4_K_M or Q4_0
      score = 100;
    } else if (targetFamily && fn.includes(targetFamily)) {
      // Family match e.g. Q4_K vs Q4_0
      score = 80;
    } else if (fn.includes('F16') || fn.includes('FP16')) {
      // Standard precision fallback
      score = 30;
    } else if (fn.includes('BF16') || fn.includes('F32') || fn.includes('FP32')) {
      // Avoid massive uncompressed precision unless necessary
      score = 5;
    } else {
      score = 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
    }
  }

  return bestCandidate;
}

export type HardwareCompatibilityTier = 'full_gpu' | 'partial_gpu' | 'too_large';

export interface HardwareMatchResult {
  tier: HardwareCompatibilityTier;
  label: string;
  badgeText: string;
  color: 'emerald' | 'blue' | 'zinc' | 'rose';
  estimatedOffloadPercent: number;
  memoryRequiredBytes: number;
  isRecommended: boolean;
  explanation: string;
}

/**
 * Calculates exact device compatibility for a model file and its support files
 * based on real system RAM, dedicated VRAM, and shared GPU memory.
 */
export function analyzeHardwareMatch(
  fileSizeBytes: number,
  secondArg: string | number,
  hw: {
    total_ram: number;
    free_ram?: number;
    gpu_vram: number;
    gpu_name?: string;
    shared_gpu_memory?: number;
    dedicated_vram?: number;
    has_dedicated_gpu?: boolean;
  } | null,
  supportFilesBytesArg?: number
): HardwareMatchResult {
  const supportFilesBytes =
    typeof secondArg === 'number'
      ? secondArg
      : typeof supportFilesBytesArg === 'number'
        ? supportFilesBytesArg
        : 0;

  const totalModelAndSupportBytes = (fileSizeBytes || 0) + supportFilesBytes;

  if (!hw || totalModelAndSupportBytes <= 0) {
    return {
      tier: 'partial_gpu',
      label: 'Compatible',
      badgeText: 'Compatible',
      color: 'zinc',
      estimatedOffloadPercent: 0,
      memoryRequiredBytes: totalModelAndSupportBytes,
      isRecommended: false,
      explanation: 'System hardware specs unavailable',
    };
  }

  const totalRamBytes = hw.total_ram || 0;
  // Dedicated VRAM: explicit dedicated_vram if available, else gpu_vram
  const dedicatedVramBytes = hw.dedicated_vram ?? hw.gpu_vram ?? 0;
  // Shared GPU memory budget: explicit WDDM shared memory or 50% of system RAM
  const sharedGpuBudgetBytes = hw.shared_gpu_memory ?? Math.floor(totalRamBytes * 0.5);
  const totalGpuCapacityBytes = dedicatedVramBytes + sharedGpuBudgetBytes;

  // Runtime buffer for KV cache (context window 4k-8k tokens), activations, and inference runtime
  const modelGb = totalModelAndSupportBytes / 1024 ** 3;
  const contextBufferGb = Math.min(Math.max(1.0, modelGb * 0.12), 2.5);
  const totalRequiredBytes = totalModelAndSupportBytes + contextBufferGb * 1024 ** 3;
  const dedicatedVramGb = dedicatedVramBytes / 1024 ** 3;
  const totalGpuCapacityGb = totalGpuCapacityBytes / 1024 ** 3;

  const hasDedicated = hw.has_dedicated_gpu ?? dedicatedVramBytes >= 2 * 1024 ** 3;

  // 1. Fits in device dedicated VRAM (or Apple Unified Memory)
  if (hasDedicated && totalRequiredBytes <= dedicatedVramBytes * 0.95) {
    return {
      tier: 'full_gpu',
      label: 'Fits in device',
      badgeText: '⚡ Fits in device',
      color: 'emerald',
      estimatedOffloadPercent: 100,
      memoryRequiredBytes: totalRequiredBytes,
      isRecommended: false,
      explanation: `Fits in device VRAM (${dedicatedVramGb.toFixed(1)} GB dedicated). Full GPU acceleration.`,
    };
  }

  if (!hasDedicated && totalRequiredBytes <= totalGpuCapacityBytes * 0.85) {
    return {
      tier: 'full_gpu',
      label: 'Fits in device',
      badgeText: '⚡ Fits in device',
      color: 'emerald',
      estimatedOffloadPercent: 100,
      memoryRequiredBytes: totalRequiredBytes,
      isRecommended: false,
      explanation: `Fits in device unified memory (${totalGpuCapacityGb.toFixed(1)} GB usable). Full GPU acceleration.`,
    };
  }

  // 2. Fits using Shared GPU Memory / System RAM
  if (totalRequiredBytes <= totalGpuCapacityBytes * 0.95) {
    const offloadPercent =
      dedicatedVramBytes > 0
        ? Math.min(95, Math.max(10, Math.round((dedicatedVramBytes / totalRequiredBytes) * 100)))
        : 0;
    return {
      tier: 'partial_gpu',
      label: 'Some layers and support files will be loaded in shared GPU memory',
      badgeText: '⚡ Some layers and support files will be loaded in shared GPU memory',
      color: 'blue',
      estimatedOffloadPercent: offloadPercent,
      memoryRequiredBytes: totalRequiredBytes,
      isRecommended: false,
      explanation: `Some layers and support files will be loaded in shared GPU memory (${offloadPercent}% in dedicated VRAM, remainder in shared memory).`,
    };
  }

  // 3. Exceeds both VRAM and Shared GPU Memory
  return {
    tier: 'too_large',
    label: 'Will not fit',
    badgeText: '⚠️ Will not fit',
    color: 'rose',
    estimatedOffloadPercent: 0,
    memoryRequiredBytes: totalRequiredBytes,
    isRecommended: false,
    explanation: `Will not fit. Requires ~${(totalRequiredBytes / 1024 ** 3).toFixed(1)} GB total memory, exceeding your device's VRAM and shared memory limit.`,
  };
}

/**
 * Accurately picks the single best recommended file for the user's hardware.
 * Returns NULL if NO files fit the user's machine (never falsely recommends an OOM file!).
 */
export function pickBestFile(
  files: { filename: string; size: number; supportSize?: number }[],
  hw: {
    total_ram: number;
    free_ram?: number;
    gpu_vram: number;
    gpu_name?: string;
    shared_gpu_memory?: number;
    dedicated_vram?: number;
    has_dedicated_gpu?: boolean;
  } | null,
  supportFilesBytes = 0
): string | null {
  if (!files.length) return null;
  if (!hw) {
    const q4 = files.find((f) => f.filename.toLowerCase().includes('q4_k_m'));
    return q4?.filename ?? files[0].filename;
  }

  const scored = files.map((f) => {
    const supp = f.supportSize ?? supportFilesBytes;
    const match = analyzeHardwareMatch(f.size, supp, hw);
    if (match.tier === 'too_large') return { file: f, score: -1000 };

    let score = 0;
    if (match.tier === 'full_gpu') score += 300;
    else if (match.tier === 'partial_gpu') score += 200;

    const fn = f.filename.toLowerCase();
    if (fn.includes('q4_k_m')) score += 75;
    else if (fn.includes('q4_k') || fn.includes('q4_0')) score += 70;
    else if (fn.includes('q5_k_m') || fn.includes('q5_k')) score += 65;
    else if (fn.includes('iq4_xs') || fn.includes('q4_k_s')) score += 55;
    else if (fn.includes('q8_0') && match.tier === 'full_gpu') score += 68;
    else if (fn.includes('q6_k')) score += 50;
    else if (fn.includes('q3_k_m') || fn.includes('iq3_m')) score += 30;
    else if (fn.includes('q2_k')) score += 5;

    return { file: f, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored[0]?.score <= 0) {
    return null;
  }

  return scored[0].file.filename;
}

/**
 * Returns model-level hardware compatibility badge for listing cards
 */
export function getModelHardwareCompatibility(
  modelId: string,
  tags: string[] = [],
  numParameters?: number,
  hw?: {
    total_ram: number;
    gpu_vram: number;
    shared_gpu_memory?: number;
    dedicated_vram?: number;
    has_dedicated_gpu?: boolean;
  } | null
): { badge: string; color: 'emerald' | 'blue' | 'rose' | 'zinc'; fits: boolean } | null {
  if (!hw) return null;

  const name = modelId.split('/').pop() || modelId;
  const match = name.match(/(\d+(?:\.\d+)?)[Bb](?:[._-]|$)/);
  let paramsB = match ? parseFloat(match[1]) : null;

  if (paramsB === null && numParameters && numParameters > 0) {
    paramsB = numParameters / 1_000_000_000;
  }

  if (paramsB === null) {
    const tagMatch = tags.find((t) => typeof t === 'string' && /^[\d.]+b$/i.test(t));
    if (tagMatch) paramsB = parseFloat(tagMatch);
  }

  if (paramsB === null) return null;

  const approxModelBytes = paramsB * 0.65 * 1024 ** 3;
  const isMultimodal = tags.some(
    (t) =>
      typeof t === 'string' &&
      (t.includes('multimodal') || t.includes('vision') || t.includes('image-text'))
  );
  const approxSupportBytes = isMultimodal ? 0.8 * 1024 ** 3 : 0;

  const result = analyzeHardwareMatch(approxModelBytes, approxSupportBytes, hw);

  if (result.tier === 'full_gpu') {
    return { badge: '⚡ Fits in device', color: 'emerald', fits: true };
  }
  if (result.tier === 'partial_gpu') {
    return { badge: '⚡ Shared GPU Memory', color: 'blue', fits: true };
  }
  return { badge: '⚠️ Will not fit', color: 'rose', fits: false };
}

export function formatEta(seconds?: number): string {
  if (!seconds || !isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || !isFinite(bytesPerSec)) return '';
  return `${formatSize(bytesPerSec)}/s`;
}

export function hashColor(str: string): [string, string] {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return [`hsl(${hue},55%,42%)`, `hsl(${(hue + 25) % 360},65%,28%)`];
}

export function getInitials(name: string): string {
  const p = name.replace(/[-_]/g, ' ').split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

/**
 * Domain-agnostic helper to derive a clean, dedicated folder name for a model and its support files.
 * Strips quantization tags, file extensions, and support prefixes/suffixes (mtp, mmproj, draft, vision, projector)
 * so both the base weights and its companions naturally map to the exact same folder.
 */
export function deriveModelFolderName(modelId: string, filename?: string): string {
  if (modelId && modelId.trim()) {
    const repoLeaf = modelId.split('/').pop() || modelId;
    const cleaned = repoLeaf.replace(/\.(?:gguf|GGUF)$/i, '').replace(/-(?:gguf|GGUF)$/i, '');
    if (cleaned.trim()) {
      return cleaned.trim();
    }
  }

  if (!filename) return 'unorganized';

  let stem = filename.split('/').pop() || filename;

  while (true) {
    const lower = stem.toLowerCase();
    if (lower.endsWith('.meta.json')) {
      stem = stem.slice(0, -'.meta.json'.length);
    } else if (lower.endsWith('.meta')) {
      stem = stem.slice(0, -'.meta'.length);
    } else if (lower.endsWith('.json')) {
      stem = stem.slice(0, -'.json'.length);
    } else if (lower.endsWith('.gguf')) {
      stem = stem.slice(0, -'.gguf'.length);
    } else if (lower.endsWith('.part')) {
      stem = stem.slice(0, -'.part'.length);
    } else {
      break;
    }
  }

  // Strip prefixes
  const prefixes = [
    'mmproj-',
    'mmproj_',
    'mmproj.',
    'mtp-',
    'mtp_',
    'mtp.',
    'draft-',
    'draft_',
    'draft.',
    'vision-',
    'vision_',
    'visual-',
    'visual_',
    'projector-',
    'projector_',
  ];
  for (const p of prefixes) {
    if (stem.toLowerCase().startsWith(p)) {
      stem = stem.slice(p.length);
      break;
    }
  }

  // Strip quant tags from the end (up to 2 rounds, e.g. -UD-Q4_K_XL)
  for (let i = 0; i < 2; i++) {
    const lastDelim = Math.max(stem.lastIndexOf('-'), stem.lastIndexOf('.'));
    if (lastDelim > 0) {
      const last = stem.slice(lastDelim + 1);
      const lastUpper = last.toUpperCase();
      const isQuant =
        lastUpper.startsWith('Q') ||
        lastUpper === 'BF16' ||
        lastUpper === 'F16' ||
        lastUpper === 'F32' ||
        lastUpper.startsWith('IQ') ||
        lastUpper.startsWith('UD');
      if (isQuant && lastDelim > 0) {
        stem = stem.slice(0, lastDelim);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Strip suffixes
  const suffixes = [
    '-mmproj',
    '_mmproj',
    '.mmproj',
    '-mtp',
    '_mtp',
    '.mtp',
    '-draft',
    '_draft',
    '.draft',
    '-vision',
    '_vision',
    '.vision',
    '-visual',
    '_visual',
    '.visual',
    '-projector',
    '_projector',
    '.projector',
    '-vit',
    '_vit',
    '.vit',
    '-clip',
    '_clip',
    '.clip',
  ];
  for (const s of suffixes) {
    if (stem.toLowerCase().endsWith(s)) {
      stem = stem.slice(0, -s.length);
      break;
    }
  }

  return stem.trim() || 'unorganized';
}
