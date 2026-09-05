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

export function parseQuantLabel(filename: string): QuantInfo {
  const match = filename
    .toLowerCase()
    .match(/[._-](q\d[_k]?[_smkl]?[msl]?|iq\d_\w+|f16|f32|bf16)([._-]|$)/i);
  const quant = match ? match[1].toUpperCase() : '';
  const bitsMap: Record<string, string> = {
    Q2: '2-bit',
    Q3: '3-bit',
    Q4: '4-bit',
    Q5: '5-bit',
    Q6: '6-bit',
    Q8: '8-bit',
    F1: '16-bit',
    BF: '16-bit',
  };
  const bits = bitsMap[quant.substring(0, 2)] ?? '';
  return { quant, bits };
}

export interface QuantDetails {
  quant: string;
  bits: string;
  quality: 'max' | 'high' | 'balanced' | 'compact' | 'extreme' | 'standard';
  qualityLabel: string;
  description: string;
}

export function parseQuantDetails(filename: string): QuantDetails {
  const match = filename
    .toLowerCase()
    .match(/[._-](q\d[_k]?[_smkl]?[msl]?|iq\d_\w+|f16|f32|bf16)([._-]|$)/i);
  const quant = match ? match[1].toUpperCase() : '';

  const detailsMap: Record<
    string,
    { bits: string; quality: QuantDetails['quality']; label: string; desc: string }
  > = {
    Q8_0: {
      bits: '8-bit',
      quality: 'max',
      label: 'Max Quality',
      desc: 'Virtually identical to original model. High VRAM/RAM required.',
    },
    Q6_K: {
      bits: '6-bit',
      quality: 'high',
      label: 'Very High Quality',
      desc: 'Minimal quality loss, recommended if you have extra memory.',
    },
    Q5_K_M: {
      bits: '5-bit',
      quality: 'high',
      label: 'High Quality',
      desc: 'Great balance of high accuracy and reduced memory.',
    },
    Q5_K_S: {
      bits: '5-bit',
      quality: 'high',
      label: 'High Quality',
      desc: 'Slightly more compact 5-bit quant.',
    },
    Q4_K_M: {
      bits: '4-bit',
      quality: 'balanced',
      label: 'Recommended (Balanced)',
      desc: 'Standard sweet-spot. Excellent quality with small footprint.',
    },
    Q4_K_S: {
      bits: '4-bit',
      quality: 'balanced',
      label: 'Balanced (Fast)',
      desc: 'Slightly faster, slightly smaller 4-bit.',
    },
    Q4_0: {
      bits: '4-bit',
      quality: 'balanced',
      label: 'Standard 4-bit',
      desc: 'Fast, legacy 4-bit quantization.',
    },
    IQ4_XS: {
      bits: '4-bit',
      quality: 'compact',
      label: 'Compact 4-bit',
      desc: 'Importance matrix optimized for lower memory.',
    },
    IQ4_NL: {
      bits: '4-bit',
      quality: 'compact',
      label: 'Non-linear 4-bit',
      desc: 'Optimized 4-bit representation.',
    },
    Q3_K_L: {
      bits: '3-bit',
      quality: 'compact',
      label: 'Low Resource (Large)',
      desc: 'Noticeable quality reduction, fits low RAM machines.',
    },
    Q3_K_M: {
      bits: '3-bit',
      quality: 'compact',
      label: 'Low Resource',
      desc: 'For systems with limited RAM/VRAM.',
    },
    Q3_K_S: {
      bits: '3-bit',
      quality: 'compact',
      label: 'Very Low Resource',
      desc: 'Small size, noticeable loss in complex tasks.',
    },
    IQ3_M: {
      bits: '3-bit',
      quality: 'compact',
      label: 'Compact 3-bit',
      desc: 'Higher quality 3-bit via importance matrix.',
    },
    Q2_K: {
      bits: '2-bit',
      quality: 'extreme',
      label: 'Extreme Compression',
      desc: 'Significant quality degradation. Only for extreme low RAM.',
    },
    IQ2_M: {
      bits: '2-bit',
      quality: 'extreme',
      label: 'Extreme Compact 2-bit',
      desc: 'Minimal footprint.',
    },
    F16: {
      bits: '16-bit',
      quality: 'max',
      label: 'Uncompressed (16-bit)',
      desc: 'Full fp16 precision. Huge memory required.',
    },
    BF16: { bits: '16-bit', quality: 'max', label: 'BFloat16', desc: 'Full precision weights.' },
  };

  const lookup = detailsMap[quant];
  if (lookup) {
    return {
      quant,
      bits: lookup.bits,
      quality: lookup.quality,
      qualityLabel: lookup.label,
      description: lookup.desc,
    };
  }

  const { bits } = parseQuantLabel(filename);
  return {
    quant: quant || 'Standard',
    bits: bits || 'Variable',
    quality: 'standard',
    qualityLabel: quant || 'Standard Format',
    description: 'Model file weights.',
  };
}

export type HardwareCompatibilityTier = 'full_gpu' | 'partial_gpu' | 'cpu_only' | 'too_large';

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
 * Calculates exact device compatibility for a model file based on real system RAM and GPU VRAM.
 */
export function analyzeHardwareMatch(
  fileSizeBytes: number,
  filename: string,
  hw: { total_ram: number; free_ram?: number; gpu_vram: number; gpu_name?: string } | null
): HardwareMatchResult {
  if (!hw || fileSizeBytes <= 0) {
    return {
      tier: 'cpu_only',
      label: 'Unknown',
      badgeText: 'Compatible',
      color: 'zinc',
      estimatedOffloadPercent: 0,
      memoryRequiredBytes: fileSizeBytes,
      isRecommended: false,
      explanation: 'System hardware specs unavailable',
    };
  }

  const totalRamGb = hw.total_ram / 1024 ** 3;
  const vramGb = hw.gpu_vram / 1024 ** 3;
  const fileSizeGb = fileSizeBytes / 1024 ** 3;

  // Runtime buffer required for KV cache, context window (4k-8k tokens), activations, llama.cpp context
  const contextBufferGb = Math.min(Math.max(1.0, fileSizeGb * 0.12), 3.0);
  const memoryRequiredGb = fileSizeGb + contextBufferGb;
  const memoryRequiredBytes = memoryRequiredGb * 1024 ** 3;

  // Windows WDDM Shared GPU Memory: up to 50% of system RAM can be mapped as shared GPU memory
  const sharedGpuBudgetGb = Math.min(totalRamGb * 0.5, Math.max(0, totalRamGb - 2.0));
  const totalGpuCapacityGb = vramGb + sharedGpuBudgetGb;

  // 1. Full Dedicated GPU Acceleration: Entire model + context fits inside dedicated VRAM
  if (vramGb >= 2 && memoryRequiredGb <= vramGb * 0.95) {
    return {
      tier: 'full_gpu',
      label: 'Full GPU Offload',
      badgeText: '⚡ Fits VRAM (Fastest)',
      color: 'emerald',
      estimatedOffloadPercent: 100,
      memoryRequiredBytes,
      isRecommended: false, // Calculated separately in pickBestFile
      explanation: `Fits entirely in ${vramGb.toFixed(1)} GB dedicated VRAM. Maximum inference speed.`,
    };
  }

  // 1b. Windows Shared GPU Memory: 100% GPU accelerated across dedicated VRAM + host Shared GPU Memory
  if (vramGb >= 2 && memoryRequiredGb <= totalGpuCapacityGb * 0.95) {
    const sharedUsedGb = Math.max(0, memoryRequiredGb - vramGb);
    return {
      tier: 'full_gpu',
      label: 'GPU + Shared Memory',
      badgeText: '⚡ 100% GPU (Shared RAM)',
      color: 'emerald',
      estimatedOffloadPercent: 100,
      memoryRequiredBytes,
      isRecommended: false,
      explanation: `100% GPU accelerated using ${vramGb.toFixed(1)} GB dedicated VRAM + ${sharedUsedGb.toFixed(1)} GB Shared GPU Memory.`,
    };
  }

  // 2. Partial GPU Offload: GPU holds as many layers as possible, remaining layers in System RAM
  const totalUsableMemGb = vramGb + totalRamGb * 0.75;
  if (
    vramGb >= 2 &&
    memoryRequiredGb <= totalUsableMemGb &&
    fileSizeGb <= vramGb + totalRamGb * 0.85
  ) {
    const offloadPercent = Math.min(
      95,
      Math.max(15, Math.round((vramGb / memoryRequiredGb) * 100))
    );
    return {
      tier: 'partial_gpu',
      label: 'Hybrid GPU + RAM',
      badgeText: `⚡ Hybrid (~${offloadPercent}% GPU)`,
      color: 'blue',
      estimatedOffloadPercent: offloadPercent,
      memoryRequiredBytes,
      isRecommended: false,
      explanation: `Offloads ~${offloadPercent}% of layers to GPU VRAM; remaining run in RAM.`,
    };
  }

  // 3. CPU Only: Fits into System RAM safely
  if (memoryRequiredGb <= totalRamGb * 0.78) {
    return {
      tier: 'cpu_only',
      label: 'CPU / RAM Only',
      badgeText: 'Runs on CPU',
      color: 'zinc',
      estimatedOffloadPercent: 0,
      memoryRequiredBytes,
      isRecommended: false,
      explanation: `Runs entirely in system RAM (${fileSizeGb.toFixed(1)} GB used). Slower generation speed.`,
    };
  }

  // 4. Too Large: Exceeds total system memory (will OOM or swap heavily)
  return {
    tier: 'too_large',
    label: 'Out of Memory',
    badgeText: '⚠️ Too Large for Device',
    color: 'rose',
    estimatedOffloadPercent: 0,
    memoryRequiredBytes,
    isRecommended: false,
    explanation: `Requires ~${memoryRequiredGb.toFixed(1)} GB RAM/VRAM, but your system only has ${totalRamGb.toFixed(1)} GB RAM + ${vramGb.toFixed(1)} GB VRAM.`,
  };
}

/**
 * Accurately picks the single best recommended file for the user's hardware.
 * Returns NULL if NO files fit the user's machine (never falsely recommends an OOM file!).
 */
export function pickBestFile(
  files: { filename: string; size: number }[],
  hw: { total_ram: number; free_ram?: number; gpu_vram: number; gpu_name?: string } | null
): string | null {
  if (!files.length) return null;
  if (!hw) {
    // Pick standard Q4_K_M if no hardware info
    const q4 = files.find((f) => f.filename.toLowerCase().includes('q4_k_m'));
    return q4?.filename ?? files[0].filename;
  }

  // Filter ONLY files that actually fit on the system
  const scored = files.map((f) => {
    const match = analyzeHardwareMatch(f.size, f.filename, hw);
    if (match.tier === 'too_large') return { file: f, score: -1000 };

    let score = 0;
    if (match.tier === 'full_gpu') score += 300;
    else if (match.tier === 'partial_gpu') score += 200;
    else if (match.tier === 'cpu_only') score += 100;

    const fn = f.filename.toLowerCase();
    if (fn.includes('q4_k_m')) score += 75;
    else if (fn.includes('q4_k') || fn.includes('q4_0')) score += 70;
    else if (fn.includes('q5_k_m') || fn.includes('q5_k')) score += 65;
    else if (fn.includes('iq4_xs') || fn.includes('q4_k_s')) score += 55;
    else if (fn.includes('q8_0') && match.tier === 'full_gpu')
      score += 68; // Q8 is great if full GPU fits
    else if (fn.includes('q6_k')) score += 50;
    else if (fn.includes('q3_k_m') || fn.includes('iq3_m')) score += 30;
    else if (fn.includes('q2_k')) score += 5;

    return { file: f, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If even the best score is negative (means all files are too large), return null
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
  hw?: { total_ram: number; gpu_vram: number } | null
): { badge: string; color: 'emerald' | 'blue' | 'rose' | 'zinc'; fits: boolean } | null {
  if (!hw) return null;

  const totalRamGb = hw.total_ram / 1024 ** 3;
  const vramGb = hw.gpu_vram / 1024 ** 3;
  const totalUsableGb = vramGb + totalRamGb * 0.75;

  // Extract parameter count
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

  // Approximate Q4 GGUF memory required (weights + context overhead)
  const approxMemGb = Math.max(1.8, paramsB * 0.65 + 1.5);

  if (vramGb >= 2 && approxMemGb <= vramGb * 0.95) {
    return { badge: '⚡ Fits VRAM', color: 'emerald', fits: true };
  }

  if (approxMemGb <= totalUsableGb) {
    return { badge: '🟢 Fits Device', color: 'blue', fits: true };
  }

  return { badge: '⚠️ Too Large', color: 'rose', fits: false };
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
