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
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const match = safeTags.find(t => typeof t === 'string' && /^[\d.]+[BM]$/i.test(t));
  return match ? match.toUpperCase() : null;
}

export function parseQuantLabel(filename: string): QuantInfo {
  const match = filename.toLowerCase().match(/[._-](q\d[_k]?[_smkl]?[msl]?|iq\d_\w+|f16|f32|bf16)([._-]|$)/i);
  const quant = match ? match[1].toUpperCase() : '';
  const bitsMap: Record<string, string> = {
    Q2: '2-bit', Q3: '3-bit', Q4: '4-bit', Q5: '5-bit',
    Q6: '6-bit', Q8: '8-bit', F1: '16-bit', BF: '16-bit',
  };
  const bits = bitsMap[quant.substring(0, 2)] ?? '';
  return { quant, bits };
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
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  const hue = Math.abs(h) % 360;
  return [`hsl(${hue},55%,42%)`, `hsl(${(hue + 25) % 360},65%,28%)`];
}

export function getInitials(name: string): string {
  const p = name.replace(/[-_]/g, ' ').split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}
