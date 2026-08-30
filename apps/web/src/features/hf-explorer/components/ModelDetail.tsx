// src/features/hf-explorer/components/ModelDetail.tsx
// LM Studio-style right detail panel with clean Download Options, details, and full README support
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ArrowSquareOut,
  Download,
  Star,
  Clock,
  Key,
  CheckCircle,
  DownloadSimple,
  HardDrives,
  CaretDown,
  CaretUp,
  Globe,
  Sparkle,
  FileText,
} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  parseModelId,
  formatCount,
  formatDate,
  formatSize,
  parseQuantDetails,
  analyzeHardwareMatch,
  pickBestFile,
} from '../lib/utils';
import { getCapabilityTags, getArchitectureName, extractParameterCount } from '../lib/capabilities';
import { useDownloadActions } from '../hooks/useHfDownloads';
import { useHfExplorerStore } from '../stores/useHfExplorerStore';
import { HfAuthorAvatar } from './HfAuthorAvatar';
import type { HfModelResult, HfModelFile, HardwareSpecs } from '../types';

interface ModelDetailProps {
  modelId: string;
  modelInfo: HfModelResult | undefined;
  files: HfModelFile[];
  readme: string;
  hardware: HardwareSpecs | null;
  downloads: Record<
    string,
    {
      progress: number;
      downloaded: number;
      total: number;
      status: string;
      error?: string;
      eta?: number;
      speed?: number;
    }
  >;
}

export interface GgufQuantOption {
  quantKey: string;
  primaryFilename: string;
  allFilenames: string[];
  totalSize: number;
  isMultiPart: boolean;
  partCount: number;
}

/* ─── Clean Custom Quantization Selector Box matching LM Studio ──────────── */
function CleanQuantSelector({
  options,
  selectedKey,
  bestKey,
  hw,
  onSelect,
}: {
  options: GgufQuantOption[];
  selectedKey: string | null;
  bestKey: string | null;
  hw: HardwareSpecs | null;
  onSelect: (key: string) => void;
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

  const selected = options.find((o) => o.quantKey === selectedKey) ?? options[0];
  if (!selected || options.length === 0) return null;

  const localName = selected.primaryFilename.split('/').pop() ?? selected.primaryFilename;
  const quantInfo = parseQuantDetails(localName);
  const isRecommended = selected.quantKey === bestKey && bestKey !== null;
  const hwMatch = analyzeHardwareMatch(selected.totalSize, selected.primaryFilename, hw);

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
          padding: '12px 14px',
          background: '#1c1c1f',
          border: isOpen ? '1px solid #3b82f6' : '1px solid #2e2e32',
          borderRadius: 8,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = '#444448';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e32';
        }}
      >
        <span
          style={{
            padding: '2px 7px',
            borderRadius: 4,
            background: '#121214',
            border: '1px solid #27272a',
            fontSize: 10,
            fontWeight: 700,
            color: '#94a3b8',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}
        >
          GGUF
        </span>

        {/* Quant label and bit depth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#f8fafc',
              fontFamily: 'monospace',
            }}
          >
            {quantInfo.quant}
          </span>
          <span
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontFamily: 'monospace',
            }}
          >
            ({quantInfo.bits})
          </span>
        </div>

        {/* Quality label & Multi-part info */}
        <span
          style={{
            fontSize: 11,
            color: '#64748b',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
        >
          {quantInfo.qualityLabel} {selected.isMultiPart && `• ${selected.partCount} parts`}
        </span>

        {/* Total Aggregated File Size */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#cbd5e1',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}
        >
          {formatSize(selected.totalSize)}
        </span>

        {/* Hardware Status Pill */}
        {isRecommended ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              color: '#4ade80',
              flexShrink: 0,
            }}
          >
            ★ Recommended
          </span>
        ) : hwMatch.tier === 'full_gpu' ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              flexShrink: 0,
            }}
          >
            ⚡ Fits VRAM
          </span>
        ) : hwMatch.tier === 'partial_gpu' ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: '#60a5fa',
              flexShrink: 0,
            }}
          >
            ⚡ Hybrid GPU
          </span>
        ) : hwMatch.tier === 'cpu_only' ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(148, 163, 184, 0.1)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#94a3b8',
              flexShrink: 0,
            }}
          >
            CPU / RAM
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              flexShrink: 0,
            }}
          >
            ⚠️ Out of Memory
          </span>
        )}

        <span style={{ color: '#64748b', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isOpen ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />}
        </span>
      </button>

      {/* Popover overlay dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#171719',
            border: '1px solid #2e2e32',
            borderRadius: 8,
            boxShadow: '0 12px 36px rgba(0,0,0,0.65)',
            zIndex: 50,
            maxHeight: 320,
            overflowY: 'auto',
            padding: 6,
          }}
        >
          <div
            style={{
              padding: '4px 8px 8px',
              fontSize: 10,
              fontWeight: 700,
              color: '#71717a',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderBottom: '1px solid #222225',
              marginBottom: 4,
            }}
          >
            Available GGUF Quantizations
          </div>

          {options.map((opt) => {
            const fn = opt.primaryFilename.split('/').pop() ?? opt.primaryFilename;
            const qDetails = parseQuantDetails(fn);
            const isSel = opt.quantKey === selected.quantKey;
            const isBestOpt = opt.quantKey === bestKey && bestKey !== null;
            const match = analyzeHardwareMatch(opt.totalSize, opt.primaryFilename, hw);

            return (
              <div
                key={opt.quantKey}
                onClick={() => {
                  onSelect(opt.quantKey);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 6,
                  background: isSel ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                  border: isSel ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s ease',
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) (e.currentTarget as HTMLDivElement).style.background = '#222226';
                }}
                onMouseLeave={(e) => {
                  if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <span style={{ width: 14, color: '#3b82f6', fontWeight: 'bold', fontSize: 12 }}>
                  {isSel ? '✓' : ''}
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      style={{
                        color: isSel ? '#ffffff' : '#f1f5f9',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        fontSize: 12,
                      }}
                    >
                      {qDetails.quant}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>
                      ({qDetails.bits})
                    </span>
                  </div>
                  <span style={{ color: '#64748b', fontSize: 10 }}>
                    {qDetails.qualityLabel} {opt.isMultiPart && `(${opt.partCount} parts)`}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      color: '#94a3b8',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {match.explanation}
                  </span>
                </div>

                <span
                  style={{
                    color: '#cbd5e1',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {formatSize(opt.totalSize)}
                </span>

                {isBestOpt ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                      flexShrink: 0,
                    }}
                  >
                    ★ Recommended
                  </span>
                ) : match.tier === 'full_gpu' ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      flexShrink: 0,
                    }}
                  >
                    ⚡ Full GPU
                  </span>
                ) : match.tier === 'partial_gpu' ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      flexShrink: 0,
                    }}
                  >
                    ⚡ Hybrid
                  </span>
                ) : match.tier === 'cpu_only' ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 500,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: '#222225',
                      color: '#94a3b8',
                      flexShrink: 0,
                    }}
                  >
                    CPU
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      flexShrink: 0,
                    }}
                  >
                    ⚠️ Too Large
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Hardware Match Explanation Pill ───────────────────────────────────── */
function HardwareStatusBanner({
  hw,
  match,
}: {
  hw: HardwareSpecs | null;
  match: ReturnType<typeof analyzeHardwareMatch>;
}) {
  if (!hw) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 6,
        background:
          match.tier === 'full_gpu'
            ? 'rgba(16, 185, 129, 0.1)'
            : match.tier === 'partial_gpu'
              ? 'rgba(59, 130, 246, 0.1)'
              : match.tier === 'cpu_only'
                ? 'rgba(255, 255, 255, 0.05)'
                : 'rgba(239, 68, 68, 0.12)',
        border: `1px solid ${
          match.tier === 'full_gpu'
            ? 'rgba(16, 185, 129, 0.25)'
            : match.tier === 'partial_gpu'
              ? 'rgba(59, 130, 246, 0.25)'
              : match.tier === 'cpu_only'
                ? 'rgba(255, 255, 255, 0.1)'
                : 'rgba(239, 68, 68, 0.3)'
        }`,
        fontSize: 11,
        color:
          match.tier === 'full_gpu'
            ? '#34d399'
            : match.tier === 'partial_gpu'
              ? '#60a5fa'
              : match.tier === 'cpu_only'
                ? '#cbd5e1'
                : '#fca5a5',
      }}
    >
      <Globe size={14} weight="bold" />
      <span>{match.explanation}</span>
    </div>
  );
}

/* ─── Download Button matching LM Studio ────────────────────────────────── */
function DownloadButton({
  modelId,
  filenames,
  totalSize,
  match,
  downloads,
  onDownload,
  onCancel,
}: {
  modelId: string;
  filenames: string[];
  totalSize: number;
  match: ReturnType<typeof analyzeHardwareMatch>;
  downloads: ModelDetailProps['downloads'];
  onDownload: (fns: string[]) => void;
  onCancel: (key: string) => void;
}) {
  if (!filenames.length) return null;
  const primaryKey = `${modelId}/${filenames[0]}`;
  const dl = downloads[primaryKey];
  const isDownloading = dl?.status === 'downloading';
  const isPaused = dl?.status === 'paused';
  const isCompleted = dl?.status === 'completed';
  const hasError = dl?.status === 'error';
  const isTooLarge = match.tier === 'too_large';

  if (isCompleted) {
    return (
      <button
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 22px',
          borderRadius: 8,
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          color: '#4ade80',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'default',
        }}
      >
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
            onClick={() => onCancel(primaryKey)}
            style={{
              fontSize: 11,
              color: '#f87171',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ height: 5, background: '#27272a', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${dl.progress}%`,
              background: isPaused ? '#fbbf24' : '#2563eb',
              transition: 'width 0.3s',
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onDownload(filenames)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 24px',
        borderRadius: 8,
        background: hasError ? 'rgba(239,68,68,0.15)' : isTooLarge ? '#dc2626' : '#2563eb',
        border: hasError ? '1px solid rgba(239,68,68,0.3)' : 'none',
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: hasError
          ? 'none'
          : isTooLarge
            ? '0 2px 10px rgba(220,38,38,0.3)'
            : '0 2px 10px rgba(37,99,235,0.3)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!hasError)
          (e.currentTarget as HTMLButtonElement).style.background = isTooLarge
            ? '#b91c1c'
            : '#1d4ed8';
      }}
      onMouseLeave={(e) => {
        if (!hasError)
          (e.currentTarget as HTMLButtonElement).style.background = isTooLarge
            ? '#dc2626'
            : '#2563eb';
      }}
    >
      <DownloadSimple size={16} weight="bold" />
      {hasError
        ? 'Retry Download'
        : isTooLarge
          ? `Download Anyway (${formatSize(totalSize)})`
          : `Download ${formatSize(totalSize)}`}
    </button>
  );
}

/* ─── Main ModelDetail Component ────────────────────────────────────────── */
export function ModelDetail({
  modelId,
  modelInfo,
  files,
  readme,
  hardware,
  downloads,
}: ModelDetailProps) {
  const { handleDownload, handleCancel } = useDownloadActions();
  const setSearchQuery = useHfExplorerStore((s) => s.setSearchQuery);
  const setActiveQuery = useHfExplorerStore((s) => s.setActiveQuery);
  const { creator, name } = parseModelId(modelId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const isGated = Boolean(modelInfo?.gated) && modelInfo?.gated !== 'false';

  /* ── 1. Strictly Filter & Group GGUF Model Files ─────────────────────── */
  const { ggufOptions, mmprojFile } = useMemo(() => {
    const ggufFiles: HfModelFile[] = [];
    let mmproj: HfModelFile | undefined;

    for (const f of files) {
      const fn = f.filename.toLowerCase();
      if (!fn.endsWith('.gguf')) continue;

      if (fn.includes('mmproj')) {
        if (!mmproj) mmproj = f;
      } else {
        ggufFiles.push(f);
      }
    }

    const groupMap = new Map<string, { primaryFilename: string; allFiles: HfModelFile[] }>();

    for (const f of ggufFiles) {
      const fn = f.filename;
      const multiMatch = fn.match(/(.+?)[-.](\d{5})-of-(\d{5})\.gguf$/i);
      if (multiMatch) {
        const baseKey = multiMatch[1].toLowerCase();
        const existing = groupMap.get(baseKey);
        if (existing) {
          existing.allFiles.push(f);
        } else {
          groupMap.set(baseKey, { primaryFilename: f.filename, allFiles: [f] });
        }
      } else {
        const key = f.filename.toLowerCase();
        groupMap.set(key, { primaryFilename: f.filename, allFiles: [f] });
      }
    }

    const options: GgufQuantOption[] = [];
    for (const group of groupMap.values()) {
      group.allFiles.sort((a, b) => a.filename.localeCompare(b.filename));
      const totalSize = group.allFiles.reduce((sum, item) => sum + item.size, 0);
      const primaryFilename = group.allFiles[0]?.filename ?? group.primaryFilename;
      const isMultiPart = group.allFiles.length > 1;

      options.push({
        quantKey: primaryFilename,
        primaryFilename,
        allFilenames: group.allFiles.map((x) => x.filename),
        totalSize,
        isMultiPart,
        partCount: group.allFiles.length,
      });
    }

    options.sort((a, b) => a.totalSize - b.totalSize);

    return { ggufOptions: options, mmprojFile: mmproj };
  }, [files]);

  // Accurate recommendation based on real device RAM & GPU VRAM
  const bestKey = useMemo(() => {
    const fileList = ggufOptions.map((o) => ({ filename: o.primaryFilename, size: o.totalSize }));
    return pickBestFile(fileList, hardware);
  }, [ggufOptions, hardware]);

  const activeOption = useMemo(() => {
    return (
      ggufOptions.find((o) => o.quantKey === selectedKey) ??
      ggufOptions.find((o) => o.quantKey === bestKey) ??
      ggufOptions[0] ??
      null
    );
  }, [ggufOptions, selectedKey, bestKey]);

  const activeMatch = useMemo(() => {
    return analyzeHardwareMatch(
      activeOption?.totalSize ?? 0,
      activeOption?.primaryFilename ?? '',
      hardware
    );
  }, [activeOption, hardware]);

  /* ── 2. Automatic Queuing Handler ── */
  const handleStartDownload = useCallback(
    (filenames: string[]) => {
      for (const fn of filenames) {
        handleDownload(modelId, fn);
      }
      if (mmprojFile) {
        handleDownload(modelId, mmprojFile.filename);
      }
    },
    [modelId, mmprojFile, handleDownload]
  );

  // Dynamic parameters, architecture, and capabilities
  const paramCount = useMemo(() => {
    return extractParameterCount(modelId, modelInfo?.tags, modelInfo?.numParameters);
  }, [modelId, modelInfo?.tags, modelInfo?.numParameters]);

  const archName = useMemo(() => {
    return getArchitectureName(modelId, modelInfo?.tags);
  }, [modelId, modelInfo?.tags]);

  const capabilities = useMemo(() => {
    return getCapabilityTags(
      modelId,
      modelInfo?.tags,
      modelInfo?.pipeline_tag,
      Boolean(mmprojFile)
    );
  }, [modelId, modelInfo?.tags, modelInfo?.pipeline_tag, mmprojFile]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#111113',
        overflowY: 'auto',
        overflowX: 'hidden',
        color: '#e2e8f0',
        scrollbarWidth: 'thin',
        scrollbarColor: '#27272a transparent',
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #1e1e22' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 16 }}>
          <HfAuthorAvatar
            creator={creator}
            avatarUrl={modelInfo?.authorData?.avatarUrl}
            size={64}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: '#f8fafc',
                margin: 0,
                marginBottom: 4,
                lineHeight: 1.1,
              }}
            >
              {name}
            </h1>
            <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' }}>{modelId}</div>
          </div>
        </div>

        {/* Stats Row (Downloads, Likes, Date) */}
        {modelInfo && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: '#cbd5e1',
              }}
            >
              <Download size={13} style={{ color: '#94a3b8' }} />
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                {formatCount(modelInfo.downloads)}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: '#cbd5e1',
              }}
            >
              <Star size={13} weight="fill" style={{ color: '#94a3b8' }} />
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                {formatCount(modelInfo.likes)}
              </span>
            </div>
            {modelInfo.last_modified && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: '#64748b',
                }}
              >
                <Clock size={11} />
                Updated {formatDate(modelInfo.last_modified)}
              </span>
            )}
          </div>
        )}

        {/* Capability Pills in Header */}
        {capabilities.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            {capabilities.map((cap) => (
              <span
                key={cap.label}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#f1f5f9',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                {cap.label}
              </span>
            ))}
          </div>
        )}

        {/* Open on Web button */}
        <a
          href={`https://huggingface.co/${modelId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 6,
            background: 'transparent',
            border: '1px solid #2e2e32',
            color: '#cbd5e1',
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.borderColor = '#475569')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.borderColor = '#2e2e32')
          }
        >
          Open on Hugging Face <ArrowSquareOut size={12} />
        </a>
      </div>

      {/* ── DOWNLOAD OPTIONS SECTION ────────────────────────────────── */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid #1e1e22' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Download Options</span>

          {/* User Hardware Specs Pill */}
          {hardware && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#94a3b8',
                background: '#1c1c1f',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #2e2e32',
              }}
            >
              <HardDrives size={13} />
              <span>
                {((hardware.total_ram || 0) / 1024 ** 3).toFixed(0)} GB RAM
                {hardware.gpu_vram > 0 &&
                  ` • ${hardware.gpu_name ? hardware.gpu_name.replace('NVIDIA GeForce ', '').replace(' Laptop GPU', '') : 'GPU'} (${((hardware.gpu_vram || 0) / 1024 ** 3).toFixed(0)} GB VRAM)`}
              </span>
            </div>
          )}
        </div>

        {/* Gated warning if gated */}
        {isGated && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 14,
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              fontSize: 12,
              color: '#facc15',
            }}
          >
            <Key size={14} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Gated model — accept license on Hugging Face and ensure your API token is set in
              Settings.
            </div>
          </div>
        )}

        {ggufOptions.length === 0 ? (
          <div
            style={{
              padding: '24px 20px',
              textAlign: 'center',
              background: '#161618',
              border: '1px dashed #2e2e32',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
              No GGUF Quantizations in this Base Repository
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 460, lineHeight: 1.5 }}>
              This repository contains raw/unquantized weights (Safetensors / PyTorch) and cannot be
              executed directly by the local llama.cpp engine. Local execution requires GGUF
              quantized models.
            </div>
            <button
              onClick={() => {
                const cleanSearch = `${name} GGUF`;
                setSearchQuery(cleanSearch);
                setActiveQuery(cleanSearch);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 6,
                background: '#2563eb',
                border: 'none',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 4,
              }}
            >
              Search GGUF Versions for {name}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Clean LM Studio style quantization selector */}
            <CleanQuantSelector
              options={ggufOptions}
              selectedKey={activeOption?.quantKey ?? null}
              bestKey={bestKey}
              hw={hardware}
              onSelect={setSelectedKey}
            />

            {/* Hardware Status Banner */}
            <HardwareStatusBanner hw={hardware} match={activeMatch} />

            {/* Vision model mmproj auto-download indicator */}
            {mmprojFile && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'rgba(168, 85, 247, 0.12)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  color: '#c084fc',
                  fontSize: 11,
                  fontWeight: 600,
                  width: 'fit-content',
                }}
              >
                <Sparkle size={13} weight="bold" />
                Vision Projector ({mmprojFile.filename}) will automatically download alongside this
                model
              </div>
            )}

            {/* Download button row */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <DownloadButton
                modelId={modelId}
                filenames={activeOption?.allFilenames ?? []}
                totalSize={activeOption?.totalSize ?? 0}
                match={activeMatch}
                downloads={downloads}
                onDownload={handleStartDownload}
                onCancel={handleCancel}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── DETAILS SECTION ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px', borderBottom: '1px solid #1e1e22' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 14 }}>
          Details
        </div>

        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 16 }}>
          {name} {paramCount ? `is a ${paramCount} parameter model` : 'model on Hugging Face'}
          {activeOption ? `, requiring ~${formatSize(activeOption.totalSize)} storage` : ''}.
          {capabilities.length > 0
            ? ` Optimized for ${capabilities.map((c) => c.label.toLowerCase()).join(', ')}.`
            : ' Built for local inference.'}
        </p>

        {/* Metadata Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {paramCount && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Parameters</span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  background: '#1c1c1f',
                  border: '1px solid #2e2e32',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#e2e8f0',
                  fontFamily: 'monospace',
                }}
              >
                {paramCount}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Architecture</span>
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 999,
                background: '#1c1c1f',
                border: '1px solid #2e2e32',
                fontSize: 12,
                fontWeight: 600,
                color: '#e2e8f0',
                fontFamily: 'monospace',
              }}
            >
              {archName}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Format</span>
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 999,
                background: '#1c1c1f',
                border: '1px solid #2e2e32',
                fontSize: 12,
                fontWeight: 600,
                color: '#e2e8f0',
                fontFamily: 'monospace',
              }}
            >
              GGUF
            </span>
          </div>
        </div>
      </div>

      {/* ── README SECTION ──────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>
          README
        </div>
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
                  <img
                    {...p}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ),
                a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
              }}
            >
              {readme}
            </ReactMarkdown>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px 20px',
              textAlign: 'center',
              gap: 10,
              background: '#19191c',
              border: '1px solid #27272a',
              borderRadius: 8,
            }}
          >
            <FileText size={28} style={{ color: '#64748b' }} />
            <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              Model documentation card
            </div>
            <a
              href={`https://huggingface.co/${modelId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: '#60a5fa',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
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
