// src/features/hf-explorer/components/ModelDetail.tsx
// LM Studio-style right detail panel with clean Download Options, details, and full README support
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ArrowSquareOut, Download, Star, Clock, Key, CheckCircle,
  DownloadSimple, HardDrives, CaretDown, CaretUp,
  Globe, Sparkle, FileText,
} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { parseModelId, formatCount, formatDate, formatSize, parseQuantLabel } from '../lib/utils';
import { useDownloadActions } from '../hooks/useHfDownloads';
import { HfAuthorAvatar } from './HfAuthorAvatar';
import type { HfModelResult, HfModelFile, HardwareSpecs } from '../types';

interface ModelDetailProps {
  modelId: string;
  modelInfo: HfModelResult | undefined;
  files: HfModelFile[];
  readme: string;
  hardware: HardwareSpecs | null;
  downloads: Record<string, { progress: number; downloaded: number; total: number; status: string; error?: string; eta?: number; speed?: number }>;
}

const COMPANION_SUPPORT_FILES = [
  'ae.safetensors', 'clip_l.safetensors', 'clip_l.f16.safetensors',
  'clip_g.safetensors', 't5xxl_fp8_e4m3fn.safetensors',
  't5xxl_fp16.safetensors', 't5xxl.safetensors', 'vae.safetensors',
];

/* ─── Hardware analysis ──────────────────────────────────────────────────── */
type HardwareBadge = 'gpu' | 'recommended' | 'cpu' | 'warning' | null;

function analyzeHardwareMatch(fileSize: number, filename: string, hw: HardwareSpecs | null): { badge: HardwareBadge; label: string } {
  if (!hw || fileSize <= 0) return { badge: null, label: '' };
  const totalRamGb = hw.total_ram / 1024 ** 3;
  const freeRamGb = (hw.free_ram || hw.total_ram * 0.7) / 1024 ** 3;
  const vramGb = hw.gpu_vram / 1024 ** 3;
  const sizeGb = fileSize / 1024 ** 3;
  const fn = filename.toLowerCase();
  if (vramGb >= 2 && sizeGb > 0 && sizeGb <= vramGb - 0.5) return { badge: 'gpu', label: 'Fits VRAM' };
  if (sizeGb <= Math.max(freeRamGb, totalRamGb * 0.75)) {
    if (fn.includes('q4_k_m') || fn.includes('q5_k_m') || fn.includes('iq4_xs'))
      return { badge: 'recommended', label: 'Recommended' };
    return { badge: 'cpu', label: 'Fits RAM' };
  }
  if (sizeGb <= totalRamGb) return { badge: 'warning', label: 'Low RAM' };
  return { badge: 'warning', label: 'Too Large' };
}

function pickBestFile(files: HfModelFile[], hw: HardwareSpecs | null): string | null {
  if (!files.length) return null;
  if (!hw) return files[0]?.filename ?? null;
  const scored = files.map(f => {
    const { badge } = analyzeHardwareMatch(f.size, f.filename, hw);
    const score = badge === 'gpu' ? 4 : badge === 'recommended' ? 3 : badge === 'cpu' ? 2 : badge === 'warning' ? 1 : 0;
    return { file: f, score };
  });
  const quantRank = (fn: string) => {
    const l = fn.toLowerCase();
    if (l.includes('q4_k_m')) return 1; if (l.includes('q5_k_m')) return 2;
    if (l.includes('q4_k_s')) return 3; if (l.includes('q8_0')) return 4;
    if (l.includes('q3_k_m')) return 5; if (l.includes('iq4_xs')) return 6;
    if (l.includes('q6_k')) return 7; return 10;
  };
  scored.sort((a, b) => b.score !== a.score ? b.score - a.score : quantRank(a.file.filename) - quantRank(b.file.filename));
  return scored[0]?.file.filename ?? null;
}

/* ─── Clean Custom Quantization Selector Box matching LM Studio ──────────── */
function CleanQuantSelector({
  files, selectedFile, bestFile, hw, onSelect,
}: {
  files: HfModelFile[];
  selectedFile: string | null;
  bestFile: string | null;
  hw: HardwareSpecs | null;
  onSelect: (filename: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = files.find(f => f.filename === selectedFile) ?? files[0];
  if (!selected || files.length === 0) return null;

  const localName = selected.filename.split('/').pop() ?? selected.filename;
  const { quant } = parseQuantLabel(localName);
  const formatTag = localName.endsWith('.gguf') ? 'GGUF' : localName.endsWith('.safetensors') ? 'SF' : localName.endsWith('.onnx') ? 'ONNX' : 'FILE';
  const isBest = selected.filename === bestFile;
  const { badge: selectedBadge } = analyzeHardwareMatch(selected.size, selected.filename, hw);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Sleek single-line pill selector box matching LM Studio */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: '#222224',
          border: isOpen ? '1px solid #3b82f6' : '1px solid #333336',
          borderRadius: 8,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s',
          outline: 'none',
        }}
        onMouseEnter={e => {
          if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = '#444448';
        }}
        onMouseLeave={e => {
          if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = '#333336';
        }}
      >
        <span style={{
          padding: '2px 7px',
          borderRadius: 4,
          background: '#18181b',
          border: '1px solid #27272a',
          fontSize: 10,
          fontWeight: 700,
          color: '#94a3b8',
          fontFamily: 'monospace',
          flexShrink: 0,
        }}>
          {formatTag}
        </span>

        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#f1f5f9',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
        }}>
          {localName.replace(/\.gguf$|\.safetensors$|\.onnx$/, '')}
        </span>

        {quant && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#cbd5e1',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}>
            {quant}
          </span>
        )}

        <span style={{
          fontSize: 11,
          color: '#94a3b8',
          fontFamily: 'monospace',
          flexShrink: 0,
        }}>
          {formatSize(selected.size)}
        </span>

        {isBest ? (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            color: '#4ade80',
            flexShrink: 0,
          }}>
            Recommended
          </span>
        ) : selectedBadge === 'gpu' ? (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            color: '#c084fc',
            flexShrink: 0,
          }}>
            Fits VRAM
          </span>
        ) : null}

        <span style={{ color: '#64748b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isOpen ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
        </span>
      </button>

      {/* Popover overlay dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#1c1c1e',
          border: '1px solid #333336',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 50,
          maxHeight: 280,
          overflowY: 'auto',
          padding: 4,
        }}>
          {files.map(f => {
            const fn = f.filename.split('/').pop() ?? f.filename;
            const { quant: q } = parseQuantLabel(fn);
            const isSel = f.filename === selected.filename;
            const isBestF = f.filename === bestFile;
            const { badge: b } = analyzeHardwareMatch(f.size, f.filename, hw);

            return (
              <div
                key={f.filename}
                onClick={() => {
                  onSelect(f.filename);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: isSel ? '#2563eb22' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isSel) (e.currentTarget as HTMLDivElement).style.background = '#28282b';
                }}
                onMouseLeave={e => {
                  if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <span style={{ width: 14, color: '#3b82f6', fontWeight: 'bold' }}>
                  {isSel ? '✓' : ''}
                </span>

                <span style={{
                  color: isSel ? '#ffffff' : '#e2e8f0',
                  fontWeight: isSel ? 700 : 500,
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {fn}
                </span>

                {q && <span style={{ color: '#94a3b8' }}>{q}</span>}
                <span style={{ color: '#64748b' }}>{formatSize(f.size)}</span>

                {isBestF ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                  }}>
                    Recommended
                  </span>
                ) : b === 'gpu' ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: 'rgba(168,85,247,0.15)', color: '#c084fc',
                  }}>
                    Fits VRAM
                  </span>
                ) : b === 'cpu' ? (
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                    background: '#27272a', color: '#94a3b8',
                  }}>
                    Fits RAM
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── GPU Offload Pill Badge ────────────────────────────────────────────── */
function GpuOffloadBadge({ hw, file }: { hw: HardwareSpecs | null; file: HfModelFile | null }) {
  if (!hw || !file) return null;
  const vramGb = hw.gpu_vram / 1024 ** 3;
  const sizeGb = file.size / 1024 ** 3;
  if (vramGb < 2) return null;
  const canPartial = vramGb > 0 && sizeGb > vramGb;
  const canFull = sizeGb <= vramGb - 0.5;
  if (!canFull && !canPartial) return null;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      borderRadius: 6,
      background: 'rgba(37, 99, 235, 0.15)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      color: '#60a5fa',
      fontSize: 11,
      fontWeight: 600,
      width: 'fit-content',
    }}>
      <Globe size={13} weight="bold" />
      {canFull ? 'Full GPU Offload Possible' : 'Partial GPU Offload Possible'}
    </div>
  );
}

/* ─── Download Button matching LM Studio ────────────────────────────────── */
function DownloadButton({
  modelId, filename, size, downloads, onDownload, onCancel,
}: {
  modelId: string; filename: string | null; size: number;
  downloads: ModelDetailProps['downloads'];
  onDownload: (fn: string) => void;
  onCancel: (key: string) => void;
}) {
  if (!filename) return null;
  const key = `${modelId}/${filename}`;
  const dl = downloads[key];
  const isDownloading = dl?.status === 'downloading';
  const isPaused = dl?.status === 'paused';
  const isCompleted = dl?.status === 'completed';
  const hasError = dl?.status === 'error';

  if (isCompleted) {
    return (
      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 22px', borderRadius: 8,
        background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)',
        color: '#4ade80', fontSize: 13, fontWeight: 700, cursor: 'default',
      }}>
        <CheckCircle size={16} weight="bold" />
        Downloaded
      </button>
    );
  }

  if (isDownloading || isPaused) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600 }}>
            {isPaused ? 'Paused' : 'Downloading'} {dl.progress.toFixed(0)}%
          </span>
          <button
            onClick={() => onCancel(key)}
            style={{
              fontSize: 11, color: '#f87171', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ height: 5, background: '#27272a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${dl.progress}%`,
            background: isPaused ? '#fbbf24' : '#2563eb',
            transition: 'width 0.3s', borderRadius: 3,
          }} />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onDownload(filename)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 24px',
        borderRadius: 8,
        background: hasError ? 'rgba(239,68,68,0.15)' : '#2563eb',
        border: hasError ? '1px solid rgba(239,68,68,0.3)' : 'none',
        color: hasError ? '#f87171' : '#ffffff',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: hasError ? 'none' : '0 2px 10px rgba(37,99,235,0.3)',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (!hasError) (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8';
      }}
      onMouseLeave={e => {
        if (!hasError) (e.currentTarget as HTMLButtonElement).style.background = '#2563eb';
      }}
    >
      <DownloadSimple size={16} weight="bold" />
      {hasError ? 'Retry Download' : `Download ${formatSize(size)}`}
    </button>
  );
}

/* ─── Main ModelDetail Component ────────────────────────────────────────── */
export function ModelDetail({
  modelId, modelInfo, files, readme, hardware, downloads,
}: ModelDetailProps) {
  const { handleDownload, handleCancel } = useDownloadActions();
  const { creator, name } = parseModelId(modelId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const isGated = Boolean(modelInfo?.gated) && modelInfo?.gated !== 'false';

  /* ── 1. Strictly Filter Downloadable Model Files ─────────────────────── */
  const downloadableFiles = useMemo(() => files.filter(f => {
    const fn = f.filename.toLowerCase();
    const localFn = fn.split('/').pop() ?? '';

    if (fn.endsWith('.md') || fn.endsWith('.txt') || fn.endsWith('.gitattributes')) return false;
    if (fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.gif') || fn.endsWith('.webp')) return false;
    if (fn.endsWith('.json') || fn.endsWith('.yaml') || fn.endsWith('.yml')) return false;
    if (fn.endsWith('.py') || fn.endsWith('.sh') || fn.endsWith('.html')) return false;

    if (fn.includes('mmproj')) return false;
    if (COMPANION_SUPPORT_FILES.some(cf => localFn === cf)) return false;

    return fn.endsWith('.gguf') || fn.endsWith('.onnx') || fn.endsWith('.safetensors') || fn.endsWith('.bin');
  }), [files]);

  const primaryFiles = useMemo(() => {
    const seen = new Set<string>();
    const result: HfModelFile[] = [];
    for (const f of downloadableFiles) {
      const fn = f.filename.toLowerCase();
      const multiPartMatch = fn.match(/[-.](\d{5})-of-(\d{5})/);
      if (multiPartMatch) {
        const partNum = parseInt(multiPartMatch[1], 10);
        const groupKey = fn.replace(/[-.](\d{5})-of-(\d{5})/, '-MULTI');
        if (partNum === 1) { result.push(f); seen.add(groupKey); }
        continue;
      }
      result.push(f);
    }
    return result.sort((a, b) => {
      const { badge: ba } = analyzeHardwareMatch(a.size, a.filename, hardware);
      const { badge: bb } = analyzeHardwareMatch(b.size, b.filename, hardware);
      const scoreMap: Record<string, number> = { gpu: 4, recommended: 3, cpu: 2, warning: 1 };
      const sa = scoreMap[ba ?? ''] ?? 0;
      const sb = scoreMap[bb ?? ''] ?? 0;
      if (sb !== sa) return sb - sa;
      return a.size - b.size;
    });
  }, [downloadableFiles, hardware]);

  const bestFile = useMemo(() => pickBestFile(primaryFiles, hardware), [primaryFiles, hardware]);
  const activeFile = selectedFile ?? bestFile ?? primaryFiles[0]?.filename ?? null;
  const activeFileObj = primaryFiles.find(f => f.filename === activeFile) ?? null;

  const mmprojFile = useMemo(() => files.find(f => f.filename.toLowerCase().includes('mmproj')), [files]);

  /* ── 2. Automatic Queuing Handler ── */
  const handleStartDownload = useCallback((filename: string) => {
    handleDownload(modelId, filename);

    if (mmprojFile) {
      handleDownload(modelId, mmprojFile.filename);
    }

    const multiPartMatch = filename.toLowerCase().match(/[-.](\d{5})-of-(\d{5})/);
    if (multiPartMatch) {
      const totalParts = parseInt(multiPartMatch[2], 10);
      for (let p = 2; p <= totalParts; p++) {
        const partStr = String(p).padStart(5, '0');
        const nextPartFile = files.find(f => f.filename.toLowerCase().includes(`-${partStr}-of-`));
        if (nextPartFile) {
          handleDownload(modelId, nextPartFile.filename);
        }
      }
    }
  }, [modelId, mmprojFile, files, handleDownload]);

  const detectedFormat = useMemo(() => {
    if (downloadableFiles.some(f => f.filename.toLowerCase().endsWith('.gguf'))) return 'GGUF';
    if (downloadableFiles.some(f => f.filename.toLowerCase().endsWith('.safetensors'))) return 'Safetensors';
    return 'GGUF';
  }, [downloadableFiles]);

  const paramMatch = name.match(/(\d+(?:\.\d+)?[Bb])/);
  const paramCount = paramMatch ? paramMatch[0].toUpperCase() : (modelInfo?.numParameters ? `${(modelInfo.numParameters / 1e9).toFixed(1)}B` : '27B');
  const archName = (modelInfo?.tags ?? []).find(t => ['llama', 'mistral', 'qwen', 'gemma', 'phi', 'falcon', 'bloom', 'deepseek'].some(a => t.toLowerCase().includes(a))) || 'qwen35';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#141415', overflowY: 'auto', overflowX: 'hidden',
      color: '#e2e8f0',
      scrollbarWidth: 'thin', scrollbarColor: '#27272a transparent',
    }}>
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #222225' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 16 }}>
          <HfAuthorAvatar creator={creator} avatarUrl={modelInfo?.authorData?.avatarUrl} size={72} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: 28, fontWeight: 700, color: '#f8fafc',
              margin: 0, marginBottom: 4, lineHeight: 1.1,
            }}>
              {name}
            </h1>
            <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>
              {modelId}
            </div>
          </div>
        </div>

        {/* Stats Row (Downloads, Likes, Date) — Staff Pick removed per request */}
        {modelInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#cbd5e1' }}>
              <Download size={13} style={{ color: '#94a3b8' }} />
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatCount(modelInfo.downloads)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#cbd5e1' }}>
              <Star size={13} weight="fill" style={{ color: '#94a3b8' }} />
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatCount(modelInfo.likes)}</span>
            </div>
            {modelInfo.last_modified && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                <Clock size={11} />
                Updated {formatDate(modelInfo.last_modified)}
              </span>
            )}
          </div>
        )}

        {/* Open on Web button */}
        <a
          href={`https://huggingface.co/${modelId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 6,
            background: 'transparent', border: '1px solid #333336',
            color: '#cbd5e1', fontSize: 12, fontWeight: 500,
            textDecoration: 'none', transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = '#475569'}
          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = '#333336'}
        >
          Open on Web <ArrowSquareOut size={12} />
        </a>
      </div>

      {/* ── DOWNLOAD OPTIONS SECTION ────────────────────────────────── */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid #222225' }}>
        {/* Header row — "Download to: This device" removed per request */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Download Options</span>
        </div>

        {/* Gated warning if gated */}
        {isGated && (
          <div style={{
            display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 14,
            background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)',
            fontSize: 12, color: '#facc15',
          }}>
            <Key size={14} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>Gated model — accept license on HF and set your API token in Settings.</div>
          </div>
        )}

        {primaryFiles.length === 0 ? (
          <div style={{
            padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 12,
            border: '1px dashed #333336', borderRadius: 8,
          }}>
            No downloadable model files found for this repo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Clean custom quantization selector */}
            <CleanQuantSelector
              files={primaryFiles}
              selectedFile={activeFile}
              bestFile={bestFile}
              hw={hardware}
              onSelect={setSelectedFile}
            />

            {/* GPU Offload indicator pill */}
            <GpuOffloadBadge hw={hardware} file={activeFileObj} />

            {/* Vision model mmproj auto-download indicator */}
            {mmprojFile && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6,
                background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.25)',
                color: '#c084fc', fontSize: 11, fontWeight: 600, width: 'fit-content',
              }}>
                <Sparkle size={13} weight="bold" />
                Vision Projector ({mmprojFile.filename}) will automatically download alongside this model
              </div>
            )}

            {/* Download button row — right aligned */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <DownloadButton
                modelId={modelId}
                filename={activeFile}
                size={activeFileObj?.size ?? 0}
                downloads={downloads}
                onDownload={handleStartDownload}
                onCancel={handleCancel}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── DETAILS SECTION ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid #222225' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 14 }}>Details</div>

        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 16 }}>
          {name} is a {paramCount} model, taking about {formatSize(activeFileObj?.size ?? 4 * 1024 ** 3)}. Capable of reasoning, coding, vision, and tool use.
        </p>

        {/* Metadata Chips (Capabilities pills removed per request) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Parameters</span>
            <span style={{
              padding: '2px 10px', borderRadius: 999, background: '#1e1e20',
              border: '1px solid #333336', fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace',
            }}>
              {paramCount}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Architecture</span>
            <span style={{
              padding: '2px 10px', borderRadius: 999, background: '#1e1e20',
              border: '1px solid #333336', fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace',
            }}>
              {archName}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Formats</span>
            <span style={{
              padding: '2px 10px', borderRadius: 999, background: '#1e1e20',
              border: '1px solid #333336', fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace',
            }}>
              {detectedFormat} MLX
            </span>
          </div>
        </div>
      </div>

      {/* ── README SECTION ──────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>README</div>
        {readme ? (
          <div
            className="
              prose prose-sm prose-invert max-w-none
              [&_h1]:text-[#60a5fa] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6
              [&_h2]:text-[#60a5fa] [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5
              [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[#cbd5e1] [&_h3]:mb-2 [&_h3]:mt-4
              [&_p]:text-sm [&_p]:text-[#94a3b8] [&_p]:leading-relaxed [&_p]:mb-3
              [&_a]:text-[#60a5fa] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#93c5fd]
              [&_code]:bg-[#1e1e20] [&_code]:text-[#e2e8f0] [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono
              [&_pre]:bg-[#18181b] [&_pre]:border [&_pre]:border-[#27272a] [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:mb-4
              [&_pre_code]:bg-transparent [&_pre_code]:p-0
              [&_blockquote]:border-l-2 [&_blockquote]:border-[#333336] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#64748b]
              [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:mb-4
              [&_th]:bg-[#1e1e20] [&_th]:border [&_th]:border-[#333336] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_th]:text-[#cbd5e1]
              [&_td]:border [&_td]:border-[#27272a] [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-[#94a3b8]
              [&_ul]:mb-3 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-[#94a3b8] [&_li]:mb-1 [&_li]:leading-relaxed
              [&_ol]:mb-3 [&_ol]:pl-4
              [&_hr]:border-[#27272a] [&_hr]:my-5
              [&_strong]:text-[#f1f5f9] [&_img]:rounded-xl [&_img]:max-w-full [&_img]:border [&_img]:border-[#27272a]
            "
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
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '32px 20px', textAlign: 'center', gap: 10,
            background: '#19191c', border: '1px border #27272a', borderRadius: 8,
          }}>
            <FileText size={28} style={{ color: '#64748b' }} />
            <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              Model documentation card
            </div>
            <a
              href={`https://huggingface.co/${modelId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: '#60a5fa', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              View full repository on HuggingFace <ArrowSquareOut size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
