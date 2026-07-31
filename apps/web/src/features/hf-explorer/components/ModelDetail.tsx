// src/features/hf-explorer/components/ModelDetail.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  X, ArrowSquareOut, Download, Star, Clock, Key, FileText,
  CheckCircle, Warning, Spinner, DownloadSimple, Cpu, Lightning,
  Code, HardDrives, Info, CaretDown, CaretRight,
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ProviderAvatar } from './ProviderAvatar';
import { ProviderName } from './ProviderName';
import { parseModelId, formatCount, formatDate, formatSize, parseQuantLabel } from '../lib/utils';
import { getCapabilityTags, getDisplayTags } from '../lib/capabilities';
import { CAP_COLOR_MAP } from '../constants/capabilities';
import { useDownloadActions } from '../hooks/useHfDownloads';
import type { HfModelResult, HfModelFile, HardwareSpecs } from '../types';

interface ModelDetailProps {
  modelId: string;
  modelInfo: HfModelResult | undefined;
  files: HfModelFile[];
  readme: string;
  hardware: HardwareSpecs | null;
  downloads: Record<string, { progress: number; downloaded: number; total: number; status: string; error?: string; eta?: number; speed?: number }>;
  onClose: () => void;
}

type ActiveTab = 'card' | 'files' | 'quickstart';

/* ─── Companion file definitions ─────────────────────────────────────────── */
/** These are support files required by image/diffusion models. They are NOT
 *  standalone loadable models and should NEVER appear in the local model list. */
const COMPANION_SUPPORT_FILES = [
  'ae.safetensors',
  'clip_l.safetensors',
  'clip_l.f16.safetensors',
  'clip_g.safetensors',
  't5xxl_fp8_e4m3fn.safetensors',
  't5xxl_fp16.safetensors',
  't5xxl.safetensors',
  'vae.safetensors',
];

interface CompanionDef {
  key: string;
  name: string;
  filename: string;
  repoId: string;
  desc: string;
  color: string;
  required: boolean;
  altFilenames?: string[];
}

/** Standard FLUX companion files from the known comfyanonymous encoder repo */
const FLUX_COMPANIONS: CompanionDef[] = [
  {
    key: 'vae',
    name: 'VAE (AutoEncoder)',
    filename: 'ae.safetensors',
    repoId: 'black-forest-labs/FLUX.1-schnell',
    desc: 'Decodes the latent image into visible pixels. Required for all FLUX models.',
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    required: true,
  },
  {
    key: 'clip',
    name: 'CLIP-L Encoder',
    filename: 'clip_l.safetensors',
    repoId: 'comfyanonymous/flux_text_encoders',
    desc: 'CLIP text encoder — converts short prompts into image guidance.',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    required: true,
  },
  {
    key: 't5',
    name: 'T5-XXL Encoder',
    filename: 't5xxl_fp8_e4m3fn.safetensors',
    repoId: 'comfyanonymous/flux_text_encoders',
    desc: 'T5-XXL text encoder — deep language understanding for complex prompts. fp8 saves ~10 GB vs fp16.',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    required: true,
  },
];

/* ─── Hardware analysis ──────────────────────────────────────────────────── */
type HardwareBadge = 'gpu' | 'recommended' | 'cpu' | 'warning' | null;

/**
 * Determines the best badge for a given file given the user's hardware.
 * Logic:
 *   - If file fits in dedicated VRAM: "gpu" (fastest)
 *   - If file fits in RAM (or shared VRAM): "recommended" if it's a good quant, else "cpu"
 *   - If file > total RAM: "warning"
 */
function analyzeHardwareMatch(fileSize: number, filename: string, hw: HardwareSpecs | null): { badge: HardwareBadge; label: string } {
  if (!hw || fileSize <= 0) return { badge: null, label: '' };
  const totalRamGb = hw.total_ram / 1024 ** 3;
  const freeRamGb = (hw.free_ram || hw.total_ram * 0.7) / 1024 ** 3;
  const vramGb = hw.gpu_vram / 1024 ** 3;
  const sizeGb = fileSize / 1024 ** 3;
  const fn = filename.toLowerCase();

  // Fits dedicated GPU VRAM (with a small headroom)
  if (vramGb >= 2 && sizeGb > 0 && sizeGb <= vramGb - 0.5)
    return { badge: 'gpu', label: 'Fits VRAM' };

  // Fits in RAM — recommend good quants
  if (sizeGb <= Math.max(freeRamGb, totalRamGb * 0.75)) {
    if (fn.includes('q4_k_m') || fn.includes('q5_k_m') || fn.includes('iq4_xs'))
      return { badge: 'recommended', label: 'Recommended' };
    return { badge: 'cpu', label: 'Fits RAM' };
  }

  // Exceeds available RAM — might still work with slow paging
  if (sizeGb <= totalRamGb)
    return { badge: 'warning', label: 'Low RAM' };

  // Definitely too big
  return { badge: 'warning', label: 'Too Large' };
}

/**
 * Picks the best file for the user's hardware.
 * Priority: fits VRAM > fits RAM with good quant > fits RAM > first file
 */
function pickBestFile(files: HfModelFile[], hw: HardwareSpecs | null): string | null {
  if (!files.length) return null;
  if (!hw) return files[0]?.filename ?? null;

  const scored = files.map(f => {
    const { badge } = analyzeHardwareMatch(f.size, f.filename, hw);
    const score = badge === 'gpu' ? 4 : badge === 'recommended' ? 3 : badge === 'cpu' ? 2 : badge === 'warning' ? 1 : 0;
    return { file: f, score };
  });

  // Among same-score files, prefer known good quants in a sensible order
  const quantRank = (fn: string) => {
    const l = fn.toLowerCase();
    if (l.includes('q5_k_m')) return 1;
    if (l.includes('q4_k_m')) return 2;
    if (l.includes('q4_k_s')) return 3;
    if (l.includes('q8_0')) return 4;
    if (l.includes('q3_k_m')) return 5;
    if (l.includes('iq4_xs')) return 6;
    if (l.includes('q6_k')) return 7;
    return 10;
  };

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return quantRank(a.file.filename) - quantRank(b.file.filename);
  });

  return scored[0]?.file.filename ?? null;
}

/* ─── Image-model companion detection ───────────────────────────────────── */
const IMAGE_ARCHS = ['flux', 'sd', 'sdxl', 'stable-diffusion', 'diffusion', 'dit', 'kolors', 'wan', 'hunyuan', 'cogvideox'];

function isImageModel(modelId: string, tags: string[]): boolean {
  const lower = modelId.toLowerCase();
  if (IMAGE_ARCHS.some(a => lower.includes(a))) return true;
  if ((tags || []).some(t => ['text-to-image', 'image-to-image', 'text-to-video', 'unconditional-image-generation'].includes(t))) return true;
  return false;
}

/** Returns true if the filename is a companion/support file (not a loadable model) */
function isCompanionFile(filename: string): boolean {
  const lower = filename.toLowerCase().split('/').pop() ?? '';
  return COMPANION_SUPPORT_FILES.some(cf => lower === cf) ||
    lower.startsWith('ae.') ||
    lower.startsWith('vae.') ||
    lower.startsWith('clip_l') ||
    lower.startsWith('clip_g') ||
    lower.startsWith('t5xxl') ||
    lower.includes('mmproj');
}

/* ─── Quick start code generator ────────────────────────────────────────── */
function buildLlamaCppCommand(modelId: string, filename: string, hw: HardwareSpecs | null): string {
  const { creator, name } = parseModelId(modelId);
  const modelPath = `./${filename}`;
  const vramGb = hw ? hw.gpu_vram / 1024 ** 3 : 0;
  const ramGb = hw ? hw.total_ram / 1024 ** 3 : 8;
  const ngl = vramGb >= 4 ? 35 : vramGb >= 2 ? 20 : 0;
  const threads = hw ? Math.max(4, hw.cpu_cores - 1) : 4;
  const ctx = ramGb >= 16 ? 8192 : 4096;

  return [
    `# Download: ${creator}/${name}`,
    `# File: ${filename}`,
    ``,
    `./llama-cli \\`,
    `  -m "${modelPath}" \\`,
    `  --n-gpu-layers ${ngl} \\`,
    `  --ctx-size ${ctx} \\`,
    `  --threads ${threads} \\`,
    `  -p "Your prompt here"`,
  ].join('\n');
}

function buildPythonSnippet(modelId: string): string {
  return [
    `from llama_cpp import Llama`,
    ``,
    `llm = Llama.from_pretrained(`,
    `    repo_id="${modelId}",`,
    `    filename="*.Q4_K_M.gguf",`,
    `    n_gpu_layers=-1,    # use all GPU layers`,
    `    n_ctx=4096,`,
    `)`,
    ``,
    `response = llm("Tell me a joke", max_tokens=128)`,
    `print(response["choices"][0]["text"])`,
  ].join('\n');
}

/* ─── Subcomponents ──────────────────────────────────────────────────────── */
function HardwareBar({ hw }: { hw: HardwareSpecs | null }) {
  if (!hw) return (
    <div className="text-[11px] text-[#71717a] py-2">Scanning hardware…</div>
  );
  const ramGb = (hw.total_ram / 1024 ** 3).toFixed(1);
  const vramGb = hw.gpu_vram > 0 ? `${(hw.gpu_vram / 1024 ** 3).toFixed(1)} GB` : 'No GPU';
  // Accurate tier: High-end = ≥16GB VRAM, Standard = ≥8GB VRAM or ≥32GB RAM, Entry = everything else
  const vramGbNum = hw.gpu_vram / 1024 ** 3;
  const ramGbNum = hw.total_ram / 1024 ** 3;
  const tier = vramGbNum >= 16 ? 'High-end' : vramGbNum >= 8 ? 'Standard' : vramGbNum >= 4 ? 'Mid-range' : ramGbNum >= 32 ? 'High RAM' : 'Entry';
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
      <Cpu size={14} className="text-[#a1a1aa] shrink-0" />
      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-[#a1a1aa]">RAM <span className="text-white font-semibold">{ramGb} GB</span></span>
        <span className="text-white/[0.1]">·</span>
        <span className="text-[#a1a1aa]">VRAM <span className="text-white font-semibold">{vramGb}</span></span>
        {hw.gpu_name && <span className="text-white/[0.1]">·</span>}
        {hw.gpu_name && <span className="text-[#52525b] truncate max-w-[120px]" title={hw.gpu_name}>{hw.gpu_name}</span>}
      </div>
      <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-[#a1a1aa] border border-white/[0.08]">{tier}</span>
    </div>
  );
}

function BadgeHardware({ badge, label }: { badge: HardwareBadge; label: string }) {
  if (!badge || !label) return null;
  const cfg = {
    gpu:         'text-violet-400 bg-violet-500/10 border-violet-500/20',
    recommended: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    cpu:         'text-sky-400 bg-sky-500/10 border-sky-500/20',
    warning:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  }[badge];
  const Icon = badge === 'gpu' ? Lightning : badge === 'recommended' ? CheckCircle : badge === 'warning' ? Warning : Cpu;
  return (
    <span className={`shrink-0 flex items-center gap-0.5 text-[9px] font-bold border px-1.5 py-0.5 rounded-full ${cfg}`}>
      <Icon size={8} weight="bold" /> {label}
    </span>
  );
}

function FileRow({
  file, modelId, hw, downloads, isBest,
  onDownload, onCancel,
}: {
  file: HfModelFile; modelId: string; hw: HardwareSpecs | null;
  downloads: ModelDetailProps['downloads'];
  isBest: boolean;
  onDownload: (f: string) => void;
  onCancel: (key: string) => void;
}) {
  const key = `${modelId}/${file.filename}`;
  const dl = downloads[key];
  const isDownloading = dl?.status === 'downloading';
  const isPaused = dl?.status === 'paused';
  const isCompleted = dl?.status === 'completed';
  const hasError = dl?.status === 'error';
  const localName = file.filename.split('/').pop() ?? file.filename;

  const isGguf = file.filename.toLowerCase().endsWith('.gguf');
  const fileExt = localName.split('.').pop()?.toUpperCase() ?? 'FILE';
  const { quant, bits } = isGguf ? parseQuantLabel(localName) : { quant: fileExt, bits: '' };
  
  const { badge, label } = analyzeHardwareMatch(file.size, file.filename, hw);

  const borderCls = isCompleted
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : hasError
    ? 'border-red-500/20 bg-red-500/5'
    : isBest
    ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
    : 'border-white/[0.05] bg-transparent hover:border-white/[0.10] hover:bg-white/[0.02]';

  return (
    <div className={`relative flex items-center justify-between gap-4 p-3 rounded-lg border transition-all duration-200 ${borderCls}`}>
      {/* Best-fit indicator */}
      {isBest && !isCompleted && (
        <div className="absolute -top-px left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent rounded-t-lg" />
      )}

      {/* Left side: Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="text-[11px] font-semibold text-white font-mono break-all leading-tight" title={file.filename}>
            {localName}
          </div>
          {isBest && (
            <span className="shrink-0 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <CheckCircle size={8} weight="bold" /> Best for your hardware
            </span>
          )}
          {quant && (
            <span className="text-[8px] font-bold bg-white/[0.06] text-[#a1a1aa] border border-white/[0.10] px-1 rounded uppercase tracking-wider shrink-0 font-mono">
              {quant}
            </span>
          )}
          {bits && <span className="text-[9px] text-[#52525b] shrink-0 font-mono">{bits}</span>}
          <span className="text-[9px] text-[#71717a] font-mono shrink-0">{formatSize(file.size)}</span>
        </div>
        {file.filename !== localName && (
          <div className="text-[9px] text-[#52525b] font-mono break-all leading-normal">
            Path: {file.filename}
          </div>
        )}
        {hasError && (
          <div className="text-[9px] text-red-400 mt-1 flex items-center gap-1">
            <Warning size={10} /> {dl?.error ?? 'Download failed'}
          </div>
        )}
      </div>

      {/* Right side: Badge + Action */}
      <div className="flex items-center gap-3 shrink-0">
        <BadgeHardware badge={badge} label={label} />
        
        <div className="w-[110px] flex justify-end">
          {isDownloading || isPaused ? (
            <div className="flex items-center gap-1.5 w-full justify-end">
              <div className="text-right">
                <span className="text-[10px] text-white font-medium block leading-none">
                  {dl.progress.toFixed(0)}%
                </span>
                <span className="text-[8px] text-[#52525b] block mt-0.5 leading-none">
                  {isPaused ? 'Paused' : 'Downloading'}
                </span>
              </div>
              <button
                onClick={() => onCancel(key)}
                title="Cancel"
                className="shrink-0 flex items-center justify-center w-6 h-6 rounded border border-white/[0.08] bg-transparent hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[#52525b] transition-all"
              >
                <X size={10} weight="bold" />
              </button>
            </div>
          ) : isCompleted ? (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
              <CheckCircle size={10} weight="bold" /> Ready
            </span>
          ) : (
            <button
              onClick={() => onDownload(file.filename)}
              className={`flex items-center justify-center gap-1 rounded px-2.5 py-1 text-[10px] font-bold transition-all shrink-0 ${
                hasError
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                  : isBest
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              <DownloadSimple size={10} weight="bold" />
              {hasError ? 'Retry' : 'Download'}
            </button>
          )}
        </div>
      </div>

      {/* Sleek inline progress bar at the bottom */}
      {(isDownloading || isPaused) && dl && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.04] overflow-hidden rounded-b-lg">
          <div
            className={`h-full transition-all duration-300 ${isPaused ? 'bg-amber-400/50' : isBest ? 'bg-emerald-500' : 'bg-white'}`}
            style={{ width: `${dl.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Companion file row ─────────────────────────────────────────────────── */
function CompanionRow({
  companion, downloads, onDownload, onCancel,
}: {
  companion: CompanionDef;
  downloads: ModelDetailProps['downloads'];
  onDownload: (repoId: string, filename: string) => void;
  onCancel: (key: string) => void;
}) {
  const key = `${companion.repoId}/${companion.filename}`;
  const dl = downloads[key];
  const isDownloading = dl?.status === 'downloading';
  const isPaused = dl?.status === 'paused';
  const isCompleted = dl?.status === 'completed';
  const hasError = dl?.status === 'error';

  return (
    <div className={`relative flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 ${
      isCompleted ? 'border-emerald-500/20 bg-emerald-500/5' :
      hasError ? 'border-red-500/20 bg-red-500/5' :
      'border-white/[0.06] bg-white/[0.01]'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className={`text-[10px] font-bold shrink-0 ${companion.color.split(' ')[0]}`}>
            {companion.name}
          </span>
          <span className="text-[9px] text-[#71717a] font-mono shrink-0">{companion.filename}</span>
          {companion.required && (
            <span className="text-[8px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1 rounded shrink-0">
              Required
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#52525b] leading-snug">{companion.desc}</p>
        {hasError && (
          <div className="text-[9px] text-red-400 mt-1 flex items-center gap-1">
            <Warning size={10} /> {dl?.error ?? 'Download failed'}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {isDownloading || isPaused ? (
          <div className="text-right min-w-[60px]">
            <span className="text-[10px] text-white font-medium block">{dl.progress.toFixed(0)}%</span>
            <span className="text-[8px] text-[#52525b] block">{isPaused ? 'Paused' : 'Downloading'}</span>
          </div>
        ) : isCompleted ? (
          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
            <CheckCircle size={10} weight="bold" /> Ready
          </span>
        ) : (
          <button
            onClick={() => onDownload(companion.repoId, companion.filename)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition-all ${
              hasError
                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                : 'bg-white/[0.06] text-white hover:bg-white/[0.12] border border-white/[0.08]'
            }`}
          >
            <DownloadSimple size={10} weight="bold" />
            {hasError ? 'Retry' : 'Download'}
          </button>
        )}
        {(isDownloading) && (
          <button
            onClick={() => onCancel(key)}
            className="flex items-center justify-center w-5 h-5 rounded border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[#52525b] transition-all"
          >
            <X size={8} weight="bold" />
          </button>
        )}
      </div>
      {(isDownloading || isPaused) && dl && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.04] overflow-hidden rounded-b-lg">
          <div
            className={`h-full transition-all duration-300 ${isPaused ? 'bg-amber-400/50' : 'bg-white'}`}
            style={{ width: `${dl.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function ModelDetail({
  modelId, modelInfo, files, readme, hardware, downloads, onClose,
}: ModelDetailProps) {
  const { handleDownload, handleCancel } = useDownloadActions();
  const { creator, name } = parseModelId(modelId);
  const [activeTab, setActiveTab] = useState<ActiveTab>('files');
  const [companionsExpanded, setCompanionsExpanded] = useState(true);
  const [selectedFileForQuickStart, setSelectedFileForQuickStart] = useState<string | null>(null);

  const isGated = Boolean(modelInfo?.gated) && modelInfo?.gated !== 'false';
  const isImage = isImageModel(modelId, modelInfo?.tags ?? []);

  /* ── File classification ────────────────────────────────────────── */
  const mmprojFile = files.find(f => f.filename.toLowerCase().includes('mmproj'));

  /**
   * Only include actual loadable model weight files.
   * Excludes: config files, tokenizer files, README, images, companion/support files.
   */
  const downloadableFiles = useMemo(() => files.filter(f => {
    const fn = f.filename.toLowerCase();
    const localFn = fn.split('/').pop() ?? '';
    
    // Explicitly exclude non-model files
    if (fn.endsWith('.md') || fn.endsWith('.txt') || fn.endsWith('.gitattributes')) return false;
    if (fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.gif') || fn.endsWith('.webp')) return false;
    if (fn.endsWith('.json') || fn.endsWith('.yaml') || fn.endsWith('.yml')) return false;
    if (fn.endsWith('.py') || fn.endsWith('.sh') || fn.endsWith('.html')) return false;
    
    // Exclude companion/support files — they appear in their own section
    if (isCompanionFile(localFn)) return false;
    if (fn.includes('mmproj')) return false;
    
    // Include actual model weight files
    return fn.endsWith('.gguf') || fn.endsWith('.onnx') || fn.endsWith('.safetensors') ||
           fn.endsWith('.bin') || fn.endsWith('.pt') || fn.endsWith('.pth') || fn.endsWith('.ckpt');
  }), [files]);

  /**
   * Primary files: for multi-part GGUF, show only the first part (others auto-download).
   * For everything else, exclude non-recommended quants at the tail.
   */
  const primaryFiles = useMemo(() => {
    // Group multi-part GGUFs: only show -00001-of-NNNNN parts (rest auto-download)
    const seen = new Set<string>();
    const result: HfModelFile[] = [];

    for (const f of downloadableFiles) {
      const fn = f.filename.toLowerCase();
      // Multi-part: e.g. model-00001-of-00004.gguf → show, model-00002-of-00004.gguf → skip
      const multiPartMatch = fn.match(/[-.](\d{5})-of-(\d{5})/);
      if (multiPartMatch) {
        const partNum = parseInt(multiPartMatch[1], 10);
        // Only show the first part; the rest will auto-download via the backend
        const groupKey = fn.replace(/[-.](\d{5})-of-(\d{5})/, '-MULTI');
        if (partNum === 1) {
          result.push(f);
          seen.add(groupKey);
        }
        continue;
      }
      result.push(f);
    }

    // Sort by hardware fit first, then quant rank
    return result.sort((a, b) => {
      const { badge: ba } = analyzeHardwareMatch(a.size, a.filename, hardware);
      const { badge: bb } = analyzeHardwareMatch(b.size, b.filename, hardware);
      const scoreMap: Record<string, number> = { gpu: 4, recommended: 3, cpu: 2, warning: 1 };
      const sa = scoreMap[ba ?? ''] ?? 0;
      const sb = scoreMap[bb ?? ''] ?? 0;
      if (sb !== sa) return sb - sa;

      // Within same tier, prefer good quants
      const rank = (fn: string) => {
        const l = fn.toLowerCase();
        if (l.includes('q5_k_m')) return 1;
        if (l.includes('q4_k_m')) return 2;
        if (l.includes('q4_k_s')) return 3;
        if (l.includes('q8_0')) return 4;
        if (l.includes('q3_k_m')) return 5;
        if (l.includes('iq4_xs')) return 6;
        if (l.includes('q6_k')) return 7;
        if (l.endsWith('.safetensors') || l.endsWith('.onnx')) return 8;
        return 10;
      };
      return rank(a.filename) - rank(b.filename);
    });
  }, [downloadableFiles, hardware]);

  const detectedFormat = useMemo(() => {
    if (downloadableFiles.some(f => f.filename.toLowerCase().endsWith('.gguf'))) return 'GGUF';
    if (downloadableFiles.some(f => f.filename.toLowerCase().endsWith('.safetensors'))) return 'Safetensors';
    if (downloadableFiles.some(f => f.filename.toLowerCase().endsWith('.onnx'))) return 'ONNX';
    return 'Model Weights';
  }, [downloadableFiles]);

  const capTags = getCapabilityTags(modelId, modelInfo?.tags ?? [], !!mmprojFile, readme);

  /** The single best file for this hardware — shown highlighted in the list */
  const bestFile = useMemo(() => pickBestFile(primaryFiles, hardware), [primaryFiles, hardware]);

  const quickStartFile = selectedFileForQuickStart ?? bestFile;

  /* Check which companion files are already downloaded */
  const companionStatuses = useMemo(() => {
    return FLUX_COMPANIONS.map(c => {
      const key = `${c.repoId}/${c.filename}`;
      const dl = downloads[key];
      return { ...c, dlKey: key, dlState: dl };
    });
  }, [downloads]);

  const allCompanionsReady = companionStatuses.every(c =>
    c.dlState?.status === 'completed'
  );

  const downloadAllCompanions = useCallback(() => {
    for (const c of companionStatuses) {
      const key = `${c.repoId}/${c.filename}`;
      const dl = downloads[key];
      if (!dl || dl.status === 'error') {
        handleDownload(c.repoId, c.filename);
      }
    }
  }, [companionStatuses, downloads, handleDownload]);

  /* ─── Render ─────────────────────────────────────────────── */
  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'files', label: `Download (${primaryFiles.length})`, icon: <HardDrives size={13} /> },
    { id: 'card', label: 'Model Card', icon: <FileText size={13} /> },
    { id: 'quickstart', label: 'Quick Start', icon: <Lightning size={13} /> },
  ];

  return (
    <div className="flex h-full min-h-0 w-full animate-in fade-in zoom-in-[0.98] duration-200">
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-0 border-b border-white/[0.06] shrink-0">
          {/* Top row */}
          <div className="flex items-start gap-3 mb-4">
            <ProviderAvatar creator={creator} avatarUrl={modelInfo?.authorData?.avatarUrl} size="lg" />
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <ProviderName creator={creator} className="text-[11px]" />
                <span className="text-white/20 text-[10px]">/</span>
                <span className="text-[9px] font-bold text-[#52525b] bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08]">{detectedFormat}</span>
                {isImage && (
                  <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">Image Model</span>
                )}
              </div>
              <h1 className="font-bold text-xl text-white tracking-tight leading-none break-words">
                {name}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://huggingface.co/${modelId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-[#71717a] hover:text-white transition-colors border border-white/[0.08] hover:border-white/[0.20] px-2.5 py-1.5 rounded-lg"
              >
                <ArrowSquareOut size={11} /> HuggingFace
              </a>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] hover:border-white/[0.16] bg-transparent hover:bg-white/[0.04] text-[#71717a] hover:text-white transition-all"
                aria-label="Close"
              >
                <X size={13} weight="bold" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          {modelInfo && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] text-[#71717a]">
                <Download size={11} className="text-sky-400/70" />
                <span className="font-semibold text-white tabular-nums">{formatCount(modelInfo.downloads)}</span>
                <span className="text-[10px] text-[#52525b]">downloads</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#71717a]">
                <Star size={11} className="text-yellow-400/70" weight="fill" />
                <span className="font-semibold text-white tabular-nums">{formatCount(modelInfo.likes)}</span>
                <span className="text-[10px] text-[#52525b]">likes</span>
              </div>
              {modelInfo.last_modified && (
                <div className="flex items-center gap-1 text-[10px] text-[#52525b]">
                  <Clock size={10} /> Updated {formatDate(modelInfo.last_modified)}
                </div>
              )}
              {isGated && (
                <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <Key size={10} weight="fill" /> Gated · HF token required
                </div>
              )}
            </div>
          )}

          {/* Capability tags */}
          <div className="flex flex-wrap gap-1 mb-3">
            {capTags.map(tag => (
              <span key={tag.label} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${CAP_COLOR_MAP[tag.color] ?? ''}`}>
                {tag.label}
              </span>
            ))}
            {getDisplayTags(modelInfo?.tags ?? [], modelId).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] text-[#71717a] border border-white/[0.06]">
                {tag}
              </span>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-0 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-white text-white'
                    : 'border-transparent text-[#52525b] hover:text-[#a1a1aa]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
          <AnimatePresence mode="wait">
            {activeTab === 'files' && (
              <motion.div
                key="files"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="p-5 flex flex-col gap-4"
              >
                {/* Hardware bar */}
                <HardwareBar hw={hardware} />

                {/* Gated warning */}
                {isGated && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-400">
                    <Key size={13} weight="fill" className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-0.5">Gated model — HF token required</p>
                      <p className="text-amber-400/70 leading-relaxed">You must accept the license on HuggingFace and provide your API token in Settings → HF Token to download this model.</p>
                    </div>
                  </div>
                )}

                {/* ── Main model files ─────────────────────────────── */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                      <DownloadSimple size={14} className="text-[#a1a1aa]" />
                      {isImage ? 'Main Model File' : 'Model Files'}
                      <span className="text-[10px] text-[#52525b] bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full">
                        {primaryFiles.length} {primaryFiles.length === 1 ? 'variant' : 'variants'}
                      </span>
                    </div>
                    {!isImage && hardware && (
                      <span className="text-[10px] text-[#52525b]">
                        Sorted by best fit for your hardware
                      </span>
                    )}
                  </div>

                  {/* Multi-part model notice */}
                  {downloadableFiles.some(f => f.filename.toLowerCase().match(/[-.](\d{5})-of-(\d{5})/)) && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-sky-500/20 bg-sky-500/5 text-[10px] text-sky-400">
                      <Info size={12} className="shrink-0 mt-0.5" />
                      <span>This is a multi-part model. Downloading part 1 will automatically queue all remaining parts.</span>
                    </div>
                  )}

                  {primaryFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2 border border-dashed border-white/[0.06] rounded-xl">
                      <HardDrives size={20} weight="duotone" className="text-[#3f3f46]" />
                      <p className="text-xs text-[#52525b]">No downloadable model files found</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {primaryFiles.map(f => (
                        <FileRow
                          key={f.filename}
                          file={f}
                          modelId={modelId}
                          hw={hardware}
                          downloads={downloads}
                          isBest={f.filename === bestFile}
                          onDownload={(fn) => {
                            handleDownload(modelId, fn);
                            setSelectedFileForQuickStart(fn);
                          }}
                          onCancel={handleCancel}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Vision model mmproj notice ───────────────────── */}
                {mmprojFile && (
                  <div className="p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 text-[10px] text-violet-400 leading-snug flex items-start gap-2">
                    <span className="shrink-0">👁</span>
                    <span><strong>Vision model:</strong> The multimodal projector (<code className="font-mono break-all">{mmprojFile.filename}</code>) will auto-download alongside any GGUF file you select.</span>
                  </div>
                )}

                {/* ── Image model companion files ──────────────────── */}
                {isImage && (
                  <div className="border border-white/[0.08] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setCompanionsExpanded(x => !x)}
                      className="w-full flex items-center gap-2.5 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <Info size={13} className="text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white">Required Companion Files</p>
                        <p className="text-[10px] text-[#71717a]">Image models need VAE + text encoders. Download all 3 once — they work for all FLUX models.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {allCompanionsReady ? (
                          <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1">
                            <CheckCircle size={10} weight="bold" /> All ready
                          </span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadAllCompanions(); }}
                            className="text-[10px] font-bold text-black bg-white hover:bg-zinc-200 px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
                          >
                            <DownloadSimple size={10} weight="bold" /> Download All
                          </button>
                        )}
                        {companionsExpanded ? <CaretDown size={12} className="text-[#71717a]" /> : <CaretRight size={12} className="text-[#71717a]" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {companionsExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 py-3 flex flex-col gap-2 border-t border-white/[0.06]">
                            {companionStatuses.map(c => (
                              <CompanionRow
                                key={c.key}
                                companion={c}
                                downloads={downloads}
                                onDownload={(repoId, filename) => handleDownload(repoId, filename)}
                                onCancel={handleCancel}
                              />
                            ))}
                            <p className="text-[9px] text-[#3f3f46] leading-relaxed pt-1">
                              These files are shared across all FLUX/image models. Once downloaded, they stay in your models folder and are automatically used by NYX.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'card' && (
              <motion.div
                key="card"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="px-6 py-5"
              >
                {readme ? (
                  <div
                    className="prose prose-sm prose-invert max-w-none
                      [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:border-b [&_h1]:border-white/[0.06] [&_h1]:pb-2
                      [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-3 [&_h2]:mt-5
                      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white/80 [&_h3]:mb-2 [&_h3]:mt-4
                      [&_p]:text-sm [&_p]:text-[#a1a1aa] [&_p]:leading-relaxed [&_p]:mb-3
                      [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-white/70
                      [&_code]:bg-white/[0.06] [&_code]:text-white/90 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono
                      [&_pre]:bg-white/[0.04] [&_pre]:border [&_pre]:border-white/[0.06] [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-4
                      [&_pre_code]:bg-transparent [&_pre_code]:p-0
                      [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#71717a]
                      [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:mb-4
                      [&_th]:bg-white/[0.04] [&_th]:border [&_th]:border-white/[0.08] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_th]:text-white/80
                      [&_td]:border [&_td]:border-white/[0.06] [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-[#a1a1aa]
                      [&_ul]:mb-3 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-[#a1a1aa] [&_li]:mb-1 [&_li]:leading-relaxed
                      [&_ol]:mb-3 [&_ol]:pl-4
                      [&_hr]:border-white/[0.06] [&_hr]:my-5
                      [&_strong]:text-white [&_img]:rounded-xl [&_img]:max-w-full [&_img]:border [&_img]:border-white/[0.06]"
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                      components={{
                        img: ({ node: _n, ...p }) => (
                          <img {...p} loading="lazy" decoding="async" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ),
                        a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
                      }}
                    >
                      {readme}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <FileText size={28} weight="duotone" className="text-[#3f3f46]" />
                    <p className="text-sm text-[#52525b]">No model card available</p>
                    <a href={`https://huggingface.co/${modelId}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-white/40 hover:text-white underline transition-colors">
                      View on HuggingFace →
                    </a>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'quickstart' && (
              <motion.div
                key="quickstart"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="p-5 flex flex-col gap-5"
              >
                {/* Hardware */}
                <HardwareBar hw={hardware} />

                {/* Step 1 — Pick a file */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[10px] font-black shrink-0">1</span>
                    Choose a quantization
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {primaryFiles.slice(0, 6).map(f => {
                      const isSelected = quickStartFile === f.filename;
                      const isBest = f.filename === bestFile;
                      return (
                        <button
                          key={f.filename}
                          onClick={() => setSelectedFileForQuickStart(f.filename)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'border-white/30 bg-white/[0.06]'
                              : 'border-white/[0.06] bg-transparent hover:border-white/[0.12] hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-white' : 'border-[#3f3f46]'}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-white truncate block">{f.filename.split('/').pop()}</span>
                            <span className="text-[9px] text-[#52525b]">{formatSize(f.size)}</span>
                          </div>
                          {isBest && (
                            <span className="shrink-0 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <CheckCircle size={8} weight="bold" /> Best for you
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2 — Download */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[10px] font-black shrink-0">2</span>
                    Download the model
                  </div>
                  {quickStartFile ? (
                    (() => {
                      const key = `${modelId}/${quickStartFile}`;
                      const dl = downloads[key];
                      const isCompleted = dl?.status === 'completed';
                      const isDownloading = dl?.status === 'downloading' || dl?.status === 'paused';
                      return isCompleted ? (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-[11px] text-emerald-400 font-semibold">
                          <CheckCircle size={13} weight="bold" /> Model downloaded and ready to use
                        </div>
                      ) : isDownloading ? (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[11px] text-[#a1a1aa]">
                          <Spinner size={13} className="animate-spin shrink-0" />
                          Downloading {quickStartFile.split('/').pop()}… {dl ? `${dl.progress.toFixed(0)}%` : ''}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownload(modelId, quickStartFile)}
                          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-black text-[12px] font-semibold hover:bg-white/90 transition-colors"
                        >
                          <DownloadSimple size={14} weight="bold" />
                          Download {quickStartFile.split('/').pop()}
                        </button>
                      );
                    })()
                  ) : (
                    <p className="text-[11px] text-[#52525b]">Select a file above to download</p>
                  )}
                </div>

                {/* Step 2b — Download companion files for image models */}
                {isImage && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-black shrink-0">+</span>
                      Download companion files
                    </div>
                    <div className="p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 text-[10px] text-[#a1a1aa] flex flex-col gap-2">
                      <p>Image models require 3 companion files (VAE + 2 text encoders). These are shared across all FLUX models — download once, use forever.</p>
                      {allCompanionsReady ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle size={10} weight="bold" /> All companion files ready
                        </span>
                      ) : (
                        <button
                          onClick={downloadAllCompanions}
                          className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30 text-[11px] font-semibold transition-colors"
                        >
                          <DownloadSimple size={11} weight="bold" /> Download VAE + Encoders
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3 — Load in NYX */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[10px] font-black shrink-0">{isImage ? '4' : '3'}</span>
                    Load in NYX
                  </div>
                  <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[11px] text-[#a1a1aa] leading-relaxed flex flex-col gap-2">
                    <p>Once downloaded, go to <strong className="text-white">Model Selector → Local Models</strong>. The model will appear automatically. Click it to load.</p>
                    {isImage && (
                      <p className="text-amber-400/80">⚠ Image model: NYX will automatically detect your companion files (VAE + encoders) from the models folder and use them together.</p>
                    )}
                  </div>
                </div>

                {/* Step 4 — llama.cpp CLI */}
                {!isImage && quickStartFile && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                      <Code size={14} className="text-[#a1a1aa]" />
                      llama.cpp CLI
                    </div>
                    <div className="relative group">
                      <pre className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-[11px] font-mono text-[#a1a1aa] overflow-x-auto leading-relaxed">
                        <code>{buildLlamaCppCommand(modelId, quickStartFile.split('/').pop() ?? quickStartFile, hardware)}</code>
                      </pre>
                    </div>
                  </div>
                )}

                {/* Python snippet */}
                {!isImage && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                      <Code size={14} className="text-[#a1a1aa]" />
                      Python (llama-cpp-python)
                    </div>
                    <pre className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-[11px] font-mono text-[#a1a1aa] overflow-x-auto leading-relaxed">
                      <code>{buildPythonSnippet(modelId)}</code>
                    </pre>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
