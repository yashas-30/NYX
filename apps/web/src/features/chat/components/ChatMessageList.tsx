// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatMessageList.tsx
 * @description Production-grade message list with reasoning display,
 *   tool visualization, branching, and Claude/Kimi-parity UX.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CopyIcon as Copy, CheckIcon as Check, TerminalIcon as Terminal, ThumbsUpIcon as ThumbsUp, ThumbsDownIcon as ThumbsDown, GitBranchIcon as GitBranch, ChevronDownIcon as ChevronDown, ChevronRightIcon as ChevronRight, XIcon as X, SparklesIcon as Sparkles, DownloadIcon as Download } from '@animateicons/react/lucide';
import { ArrowDown, Pencil, RefreshCw, Wrench, FileText, Image as ImageIcon, Clock, AlertTriangle, Loader2, Square, Volume2, VolumeX, Pin, PinOff, Shield, Zap } from 'lucide-react';
import { ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { CodeBlock } from '../../../components/chat/CodeBlock';
import { getDomainFaviconUrl, getEmojiForTopic } from '../../../core/services/mediaEngine';

import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import { toast } from '@src/shared/components/ui/sonner';
import { AVAILABLE_MODELS } from '@src/shared/config/models';
import { Logo, NyxLoader, AnimatedLogo } from '@src/assets/icons/icons';
import { useAppStore } from '@src/stores/useAppStore';
import { ThinkingBlock } from './ThinkingBlock';
import { FourDotsWaveLoader } from './FourDotsWaveLoader';
import { isReasoningModel } from '@src/infrastructure/utils/provider';
import { ArtifactPanel } from './ArtifactPanel';
import { Citation, CitationCard, SourcesFooter } from './CitationCard';
import { SearchResultsPanel } from './SearchResultsPanel';
import { ImageArtifactCard } from './ImageArtifactCard';
import { VideoArtifactCard } from './VideoArtifactCard';
import { AudioArtifactCard } from './AudioArtifactCard';
import { ImageLightbox } from './ImageLightbox';
import { tts } from '@src/features/voice/tts';
import { useVirtualMessages } from '../hooks/useVirtualMessages';
import type { StreamingArtifact } from './MessageBubble/ArtifactRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Citation is imported from CitationCard — re-export for consumers that import it from here
export type { Citation };

// Re-export so MessageBubble sub-components can import without circular deps
export type { StreamingArtifact };

export interface ChatMessageListProps {
  history: ChatMessage[];
  activeStreamMessage?: ChatMessage | null;
  activeAgent?: 'lucifer';
  isLoading: boolean;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
  submitReward?: (id: string, reward: number) => void;
  onEditMessage?: (index: number, newContent: string) => void;
  onRegenerate?: (index: number) => void;
  onBranchFromMessage?: (index: number) => void;
  onBranchChange?: (index: number, branchOffset: number) => void;

  activeModel?: string;
  /** Typed via StreamingArtifact — replaces the original any */
  onArtifactClick?: (artifact: StreamingArtifact) => void;
  approveTool?: (index: number, approvalId: string) => void;
  rejectTool?: (index: number, approvalId: string) => void;
  onPinToggle?: (index: number) => void;
}

interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  isLast: boolean;
  isStreaming: boolean;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  submitReward?: (id: string, reward: number) => void;
  onEdit?: (index: number, content: string) => void;
  onRegenerate?: (index: number) => void;
  onBranch?: (index: number) => void;
  activeModel?: string;
  onBranchChange?: (index: number, branchOffset: number) => void;
  onArtifactClick?: (artifact: any) => void;
  approveTool?: (index: number, approvalId: string) => void;
  rejectTool?: (index: number, approvalId: string) => void;
  onPinToggle?: (index: number) => void;
  onOpenLightbox?: (url: string, prompt: string, engine?: string) => void;
}

// ---------------------------------------------------------------------------
// Tool Call Visualizer
// ---------------------------------------------------------------------------

const formatToolAction = (rawName: any, argsInput: any, status: string) => {
  const name = typeof rawName === 'string' ? rawName : (rawName ? String(rawName) : 'tool');
  let args: any = {};
  if (typeof argsInput === 'object' && argsInput !== null) {
    args = argsInput;
  } else if (typeof argsInput === 'string') {
    try { args = JSON.parse(argsInput || '{}'); } catch {}
  }

  const isDone = status === 'completed' || status === 'success';
  const prefix = isDone ? 'Finished' : (status === 'error' ? 'Failed to' : 'Using');

  switch (name) {
    case 'searchWeb':
    case 'web_search':
      return isDone ? 'Searched the web' : 'Searching the web...';
    case 'agent_handoff':
      return isDone ? `Received context from ${args.agent || 'agent'}` : `Handed off task to ${args.agent || 'agent'}...`;
    case 'calculator':
      return isDone ? 'Calculated result' : 'Calculating...';
    case 'getWeather':
      return isDone ? `Checked weather for ${args.location || 'location'}` : `Checking weather for ${args.location || 'location'}...`;
    case 'run_python':
    case 'python':
      return isDone ? 'Ran Python code' : 'Running Python code...';
    case 'read_file':
      return isDone ? 'Read file contents' : 'Reading file...';
    case 'list_dir':
      return isDone ? 'Listed directory contents' : 'Listing directory...';
    default:
      const formattedName = name.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
      return `${prefix} ${formattedName.toLowerCase()}...`;
  }
};

export const ToolCallCard: React.FC<{
  tool: ToolCall;
  status: 'pending' | 'running' | 'completed' | 'success' | 'error';
}> = memo(({ tool, status }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = status === 'running';
  const isError = status === 'error';
  const isDone = status === 'completed' || status === 'success';

  const toolName = tool?.function?.name || (tool as any)?.name || (tool as any)?.tool || 'tool';
  const rawArgs = tool?.function?.arguments || (tool as any)?.args || (tool as any)?.arguments || '{}';
  const actionText = formatToolAction(toolName, rawArgs, status);

  let formattedArgs = rawArgs;
  if (typeof rawArgs === 'string') {
    try {
      formattedArgs = JSON.stringify(JSON.parse(rawArgs || '{}'), null, 2);
    } catch {
      formattedArgs = rawArgs;
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    formattedArgs = JSON.stringify(rawArgs, null, 2);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 flex flex-col group"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-fit flex items-center gap-2 px-3 py-1.5 rounded-full text-left cursor-pointer bg-muted/30 hover:bg-muted/60 transition-colors border border-border/50"
      >
        {isRunning ? (
          <Loader2 size={12} className="text-muted-foreground animate-spin shrink-0" />
        ) : isError ? (
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
        ) : (
          <Wrench size={12} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-[12px] font-medium text-muted-foreground truncate max-w-[250px]">
          {actionText}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground/60 shrink-0 ml-1" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground/60 shrink-0 ml-1" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden w-full mt-2"
          >
            <div className="pl-4 border-l border-border/40 ml-2 py-1">
              <div className="text-[10px] text-muted-foreground/80 font-mono mb-1 uppercase tracking-wider">
                {toolName} Inputs
              </div>
              <pre className="text-[11px] font-mono text-foreground/80 bg-muted/20 rounded-md p-3 overflow-x-auto border border-border/30">
                {formattedArgs}
              </pre>
              
              {tool.result && (
                  <div className="mt-3">
                      <div className="text-[10px] text-muted-foreground/80 font-mono mb-1 uppercase tracking-wider">
                        Result
                      </div>
                      <pre className="text-[11px] font-mono text-foreground/80 bg-muted/20 rounded-md p-3 overflow-x-auto border border-border/30 max-h-[300px] overflow-y-auto">
                        {tool.result}
                      </pre>
                  </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
ToolCallCard.displayName = 'ToolCallCard';

// ---------------------------------------------------------------------------
// Context Ingestion Card (Kimi AI Style)
// ---------------------------------------------------------------------------

export const ContextIngestionCard: React.FC<{
  tools: { tool: ToolCall; status: string }[];
}> = memo(({ tools }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tools.some(t => t.status === 'running');
  const isError = tools.some(t => t.status === 'error');

  if (tools.length === 0) return null;

  const isWebSearchGroup = tools.every(t => {
    const name = t.tool?.function?.name || (t.tool as any)?.name || (t.tool as any)?.tool;
    return name === 'web_search' || name === 'searchWeb';
  });

  const headerTitle = isWebSearchGroup
    ? `Searched ${tools.length} web source${tools.length !== 1 ? 's' : ''}`
    : `Read ${tools.length} document${tools.length !== 1 ? 's' : ''}`;

  const statusLabel = isRunning
    ? (isWebSearchGroup ? 'Searching...' : 'Reading...')
    : isError
      ? 'Error'
      : (isWebSearchGroup ? 'Searched' : 'Analyzed');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`my-2 rounded-md border overflow-hidden ${
        isError
          ? 'bg-red-500/5 border-red-500/20'
          : isRunning
            ? 'bg-sky-500/5 border-sky-500/20'
            : 'bg-emerald-500/5 border-emerald-500/20'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer hover:bg-muted/40 transition-colors"
      >
        {isRunning ? (
          <Loader2 size={13} className="text-sky-400 animate-spin shrink-0" />
        ) : isError ? (
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
        ) : (
          <Sparkles size={13} className="text-emerald-400 shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-foreground/90 truncate">
          {headerTitle}
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium uppercase tracking-wider ml-auto shrink-0 ${
            isRunning
              ? 'bg-sky-500/10 text-sky-400'
              : isError
                ? 'bg-red-500/10 text-red-400'
                : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {statusLabel}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1 border-t border-border flex flex-col gap-2">
              {tools.map((t, i) => {
                const name = t.tool?.function?.name || (t.tool as any)?.name || (t.tool as any)?.tool || 'Tool';
                let argsDisplay = '';
                try {
                  const rawArgs = t.tool?.function?.arguments || (t.tool as any)?.args || (t.tool as any)?.arguments;
                  const parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
                  if (parsed?.query) {
                    argsDisplay = ` "${parsed.query}"`;
                  }
                } catch {}

                const label = (name === 'web_search' || name === 'searchWeb')
                  ? `DuckDuckGo Live Search${argsDisplay}`
                  : `${name}${argsDisplay}`;

                return (
                  <div key={i} className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded px-2.5 py-1.5 flex justify-between items-center">
                    <span className="truncate max-w-[80%] font-sans text-[11px] text-foreground/90">{label}</span>
                    <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider shrink-0 ml-2">{t.status}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
ContextIngestionCard.displayName = 'ContextIngestionCard';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Inline Source Avatar Component
// ---------------------------------------------------------------------------

export const InlineSourceAvatar: React.FC<{ href: string; children?: React.ReactNode }> = memo(({ href, children }) => {
  const [imgError, setImgError] = useState(false);
  const faviconUrl = useMemo(() => getDomainFaviconUrl(href), [href]);

  let domain = '';
  try {
    domain = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    domain = href || '';
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Source: ${domain}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 my-0.5 rounded-full bg-muted/60 hover:bg-muted/90 border border-border/70 text-foreground transition-all hover:scale-105 active:scale-95 no-underline align-middle text-xs group cursor-pointer shadow-2xs"
    >
      {!imgError ? (
        <img
          src={faviconUrl}
          alt={domain}
          className="w-3.5 h-3.5 rounded-full object-contain shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
          {domain.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-[11px] font-medium text-foreground/90 group-hover:text-primary transition-colors max-w-[140px] truncate">
        {domain}
      </span>
    </a>
  );
});
InlineSourceAvatar.displayName = 'InlineSourceAvatar';

// ---------------------------------------------------------------------------
// Image Attachment Display
// ---------------------------------------------------------------------------

export const ImageAttachment: React.FC<{ src: string; alt?: string }> = memo(({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [proxiedSrc, setProxiedSrc] = useState<string | null>(null);

  const displaySrc = useMemo(() => {
    if (!src) return '';
    let cleaned = src.trim();
    if (cleaned.startsWith('//')) {
      cleaned = `https:${cleaned}`;
    }
    if (cleaned.startsWith('data:') || cleaned.startsWith('blob:') || cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      return cleaned;
    }
    if (cleaned.startsWith('/uploads/') || cleaned.startsWith('/api/')) {
      return `${(window as Record<string, any>).__NYX_BACKEND_URL__ || ''}${cleaned}`;
    }
    if (cleaned.startsWith('file://') || cleaned.startsWith('C:') || cleaned.startsWith('D:') || (cleaned.startsWith('/') && !cleaned.startsWith('/assets'))) {
      try {
        const cleanPath = cleaned.replace(/^file:\/\/\/?/, '');
        return convertFileSrc(cleanPath);
      } catch {
        return cleaned;
      }
    }
    return cleaned;
  }, [src]);

  const activeImageSrc = proxiedSrc || displaySrc;

  const handleImageError = useCallback(() => {
    if (!proxiedSrc && displaySrc && displaySrc.startsWith('http')) {
      // Fetch base64 data URL via Rust backend proxy (bypasses webview CORS & hotlink blocks)
      invoke<string>('fetch_image_data_url_command', { url: displaySrc })
        .then((b64DataUrl: string) => {
          if (b64DataUrl) {
            setProxiedSrc(b64DataUrl);
            setError(false);
          } else {
            setError(true);
          }
        })
        .catch(() => {
          setError(true);
        });
    } else {
      setError(true);
    }
  }, [displaySrc, proxiedSrc]);

  if (error) {
    return (
      <a
        href={displaySrc}
        target="_blank"
        rel="noopener noreferrer"
        className="my-2.5 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border/70 hover:bg-muted/70 transition-all text-xs font-medium text-foreground/90 no-underline max-w-md"
      >
        <ImageIcon size={16} className="text-primary shrink-0" />
        <span className="truncate flex-1">{alt || displaySrc}</span>
      </a>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="my-2.5 relative group/image"
    >
      <div
        className={`relative rounded-xl overflow-hidden border border-border/70 bg-muted/40 cursor-zoom-in transition-all ${
          expanded
            ? 'fixed inset-4 z-50 flex items-center justify-center bg-black/80 p-4'
            : 'inline-block max-w-lg shadow-md hover:border-indigo-500/40'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {!loaded && (
          <div className="w-48 h-36 flex items-center justify-center bg-slate-900/60 animate-pulse">
            <ImageIcon size={24} className="text-muted-foreground/50 animate-pulse" />
          </div>
        )}

        <img
          src={activeImageSrc}
          alt={alt || 'Attached image'}
          referrerPolicy="no-referrer"
          className={`max-h-80 max-w-full object-contain rounded-xl transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={handleImageError}
        />

        {expanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            className="absolute top-4 right-4 p-2 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );


});
ImageAttachment.displayName = 'ImageAttachment';

// ---------------------------------------------------------------------------
// File Attachment Display (Claude Style)
// ---------------------------------------------------------------------------

export const FileAttachment: React.FC<{ name: string; size?: number; type?: string; mimeType?: string }> = memo(({ name, size, type, mimeType }) => {
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-3 py-2 bg-muted/30 border border-border rounded-lg max-w-[280px] shadow-sm mb-2"
    >
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-primary/10 text-primary rounded-md">
        <FileText size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-foreground truncate">{name}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">
          {type || mimeType?.split('/')[1] || 'FILE'} {size ? `• ${formatSize(size)}` : ''}
        </p>
      </div>
    </motion.div>
  );
});
FileAttachment.displayName = 'FileAttachment';


// ---------------------------------------------------------------------------
// Streaming Cursor & Loader
// ---------------------------------------------------------------------------

export const StreamingCursor = memo(() => (
  <span className="inline-flex items-center justify-center ml-1 align-baseline">
    <motion.span
      className="inline-block w-2.5 h-2.5 rounded-full bg-primary/80"
      animate={{ scale: [0.7, 1.2, 0.7], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  </span>
));
StreamingCursor.displayName = 'StreamingCursor';

// ---------------------------------------------------------------------------
// Markdown Renderer
// ---------------------------------------------------------------------------
import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';

/**
 * Intelligently binds verified topic photos directly under the specific
 * sub-topics, headings, and paragraphs they represent, rather than dumping them at the end.
 */
export function distributeMediaIntoMarkdown(
  rawContent: string,
  images?: Array<{ url?: string; name?: string; engine?: string; data?: string; mimeType?: string; aspectRatio?: string }>,
  _videos?: Array<{ url?: string; previewUrl?: string; title?: string; duration?: number; source?: string; author?: string; authorUrl?: string }>,
  _audios?: Array<{ url?: string; title?: string; artist?: string; duration?: number; source?: string; tags?: string; previewUrl?: string }>
): string {
  if (!rawContent) return '';
  if (!images || images.length === 0) {
    return rawContent;
  }

  // Identify media that is already explicitly placed in markdown
  const embeddedUrls = new Set<string>();
  const imgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(rawContent)) !== null) {
    embeddedUrls.add(match[1]);
  }

  const unplacedImages = (images || []).filter((img): img is { url: string; name?: string; engine?: string; data?: string; mimeType?: string; aspectRatio?: string } => !!img?.url && !embeddedUrls.has(img.url));

  if (unplacedImages.length === 0) {
    return rawContent;
  }

  // ── Keyword overlap scorer — matches image titles to section headings ─────────
  const scoreImgToHeader = (imgTitle: string, headerText: string): number => {
    const hWords = headerText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const iWords = imgTitle.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (!hWords.length || !iWords.length) return 0;
    let score = 0;
    for (const hw of hWords) {
      if (iWords.some(iw => iw.includes(hw) || hw.includes(iw))) score++;
    }
    return score / Math.max(hWords.length, 1);
  };

  // Split by markdown headings (e.g. ## Subtopic or ### Subtopic)
  const headerRegex = /^(#{1,4}\s+.+)$/gm;
  const parts = rawContent.split(headerRegex);

  if (parts.length > 1) {
    // Collect heading indices
    const headingIndices: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (/^#{1,4}\s+/.test(parts[i].trim())) headingIndices.push(i);
    }
    const sectionCount = headingIndices.length;
    // 1 image per section, capped at available images
    const maxImgs = Math.min(unplacedImages.length, Math.max(1, sectionCount));

    // Greedy best-match assignment: heading index → image index
    const imageAssignment: Record<number, number> = {};
    const usedImgIdx = new Set<number>();

    // Pass 1: assign by relevance score
    for (const hi of headingIndices) {
      if (usedImgIdx.size >= maxImgs) break;
      const headerText = parts[hi].trim().toLowerCase();
      let bestScore = 0;
      let bestJ = -1;
      for (let j = 0; j < unplacedImages.length; j++) {
        if (usedImgIdx.has(j)) continue;
        const s = scoreImgToHeader(unplacedImages[j].name || '', headerText);
        if (s > bestScore) { bestScore = s; bestJ = j; }
      }
      if (bestJ !== -1 && bestScore > 0) {
        imageAssignment[hi] = bestJ;
        usedImgIdx.add(bestJ);
      }
    }
    // Pass 2: fill remaining slots sequentially
    for (const hi of headingIndices) {
      if (usedImgIdx.size >= maxImgs) break;
      if (hi in imageAssignment) continue;
      for (let j = 0; j < unplacedImages.length; j++) {
        if (!usedImgIdx.has(j)) {
          imageAssignment[hi] = j;
          usedImgIdx.add(j);
          break;
        }
      }
    }

    const result: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      result.push(part);

      if (/^#{1,4}\s+/.test(part.trim())) {
        // Image: place assigned image for this heading
        if (i in imageAssignment) {
          const img = unplacedImages[imageAssignment[i]];
          if (img) result.push(`\n\n![${img.name || 'Visual Reference'}](${img.url})\n\n`);
        }
      }
    }

    return result.join('');
  }

  // ── No headings: attach 1 image after first paragraph ─
  const firstBreak = rawContent.indexOf('\n\n');
  if (firstBreak !== -1) {
    const before = rawContent.slice(0, firstBreak);
    const after = rawContent.slice(firstBreak);
    const mediaTags: string[] = [];
    if (unplacedImages.length > 0) mediaTags.push(`\n\n![${unplacedImages[0].name || 'Visual Reference'}](${unplacedImages[0].url})\n\n`);
    return before + mediaTags.join('') + after;
  }

  return rawContent;
}


const MemoizedMarkdownBlock: React.FC<{
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  onOpenLightbox?: (url: string, prompt: string, engine?: string) => void;
}> = memo(({ content, isStreaming, citations, onOpenLightbox }) => {
  const smoothContent = useSmoothTypewriter(content, isStreaming || false);
  const deferredContent = React.useDeferredValue(smoothContent);

  // Keep a ref so the components object can read the latest citations
  // without being recreated every time citations changes (e.g. every stream chunk).
  const citationsRef = useRef<Citation[] | undefined>(citations);
  useEffect(() => { citationsRef.current = citations; }, [citations]);

  let processedContent = deferredContent;
  // Replace single and multi-source citations (e.g. [Source 6, Source 8], [Source 6, 8], [Source 1])
  // with interactive website avatar badges linked directly to verified URLs
  processedContent = processedContent.replace(/\[(?:Source\s*)?(\d+(?:\s*,\s*(?:Source\s*)?\d+)*)\]/gi, (_match, group) => {
    if (!citations || citations.length === 0) return '';
    const ids = group.match(/\d+/g) || [];
    const links = ids
      .map((id: string) => {
        const cite = citations.find((c) => c.id === id || String(c.index) === id);
        if (cite && cite.url) {
          let domain = '';
          try {
            domain = new URL(cite.url).hostname.replace(/^www\./, '');
          } catch {
            domain = cite.title || `Source ${id}`;
          }
          return `[${domain}](${cite.url})`;
        }
        return '';
      })
      .filter(Boolean);
    return links.length > 0 ? ` ${links.join(' ')} ` : '';
  });

  // Strip any leftover unlinked [Source ...] or [Source N, M] raw text so ugly raw text is never shown
  processedContent = processedContent.replace(/\s*\[(?:Source\s*)?\d+(?:\s*,\s*(?:Source\s*)?\d+)*\](?!\()/gi, '');

  // Escape unescaped currency dollar signs (e.g. $1,500 or $1500) so KaTeX does not treat prices as math delimiters
  processedContent = processedContent.replace(/\$(\d+(?:,\d{3})*(?:\.\d+)?)/g, '\\$$1');

  // Auto-wrap sequences of arrow nodes (e.g. A --> B["..."]\nB --> C["..."]) outside of code blocks
  if (!processedContent.includes('```mermaid')) {
    processedContent = processedContent.replace(
      /(?:^|\n)((?:[A-Za-z0-9_]+(?:\s*\[[^\]]+\]|\s*\([^\)]+\))?\s*(?:-->|==>|--\s*>\s*)\s*[A-Za-z0-9_]+(?:\s*\[[^\]]+\]|\s*\([^\)]+\))?(?:\n|$)){2,})/g,
      (_full, group) => {
        return `\n\n\`\`\`mermaid\nflowchart TD\n${group.trim()}\n\`\`\`\n\n`;
      }
    );
  }

  // Ensure headings have newlines so they are parsed cleanly
  processedContent = processedContent.replace(/([^\n])\s*(#{1,6}\s+[^\n]+)/g, '$1\n\n$2\n\n');

  // Fix markdown table rows that were accidentally bracketed e.g. [## Heading ... | col1 | col2 | ... ]
  processedContent = processedContent.replace(/\[\s*(#{1,6}\s+[^\]]+)\]/g, '$1');

  // Helper to detect if header children already contain an image or ImageAttachment to avoid double icons
  const hasImageChild = (node: any): boolean => {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(hasImageChild);
    if (typeof node === 'object') {
      if (node.type === 'img' || node.props?.src || node.type?.name === 'ImageAttachment') return true;
      if (node.props?.children) return hasImageChild(node.props.children);
    }
    return false;
  };

  const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}]/u;

  const getTopicIcon = (titleText: string): { type: 'svg'; url: string } | { type: 'emoji'; char: string } | null => {
    if (!titleText || typeof titleText !== 'string') return null;
    // If text already contains an emoji character, do NOT auto-prepend another emoji
    if (EMOJI_REGEX.test(titleText)) return null;

    const cleanText = titleText.replace(/[^\w\s]/gi, '').trim();
    if (!cleanText) return null;
    const lower = cleanText.toLowerCase();

    // 1. Vector SVGs — well-known tech logos via Iconify
    if (lower.includes('python')) return { type: 'svg', url: 'https://api.iconify.design/logos/python.svg' };
    if (lower.includes('react')) return { type: 'svg', url: 'https://api.iconify.design/logos/react.svg' };
    if (lower.includes('rust')) return { type: 'svg', url: 'https://api.iconify.design/logos/rust.svg' };
    if (lower.includes('docker')) return { type: 'svg', url: 'https://api.iconify.design/logos/docker-icon.svg' };
    if (lower.includes('kubernetes') || lower.includes('k8s')) return { type: 'svg', url: 'https://api.iconify.design/logos/kubernetes.svg' };
    if (lower.includes('linux')) return { type: 'svg', url: 'https://api.iconify.design/logos/tux.svg' };
    if (lower.includes('typescript')) return { type: 'svg', url: 'https://api.iconify.design/logos/typescript-icon.svg' };
    if (lower.includes('javascript')) return { type: 'svg', url: 'https://api.iconify.design/logos/javascript.svg' };
    if (lower.includes('node')) return { type: 'svg', url: 'https://api.iconify.design/logos/nodejs-icon.svg' };
    if (lower.includes('git') && !lower.includes('github')) return { type: 'svg', url: 'https://api.iconify.design/logos/git-icon.svg' };
    if (lower.includes('github')) return { type: 'svg', url: 'https://api.iconify.design/logos/github-icon.svg' };
    if (lower.includes('vue')) return { type: 'svg', url: 'https://api.iconify.design/logos/vue.svg' };
    if (lower.includes('angular')) return { type: 'svg', url: 'https://api.iconify.design/logos/angular-icon.svg' };
    if (lower.includes('svelte')) return { type: 'svg', url: 'https://api.iconify.design/logos/svelte-icon.svg' };
    if (lower.includes('golang') || lower.includes(' go ') || lower.match(/\bgo\b/)) return { type: 'svg', url: 'https://api.iconify.design/logos/go.svg' };
    if (lower.includes('java') && !lower.includes('javascript')) return { type: 'svg', url: 'https://api.iconify.design/logos/java.svg' };
    if (lower.includes('kotlin')) return { type: 'svg', url: 'https://api.iconify.design/logos/kotlin-icon.svg' };
    if (lower.includes('swift')) return { type: 'svg', url: 'https://api.iconify.design/logos/swift.svg' };
    if (lower.includes('aws') || lower.includes('amazon')) return { type: 'svg', url: 'https://api.iconify.design/logos/aws.svg' };
    if (lower.includes('azure')) return { type: 'svg', url: 'https://api.iconify.design/logos/microsoft-azure.svg' };
    if (lower.includes('gcp') || lower.includes('google cloud')) return { type: 'svg', url: 'https://api.iconify.design/logos/google-cloud.svg' };
    if (lower.includes('postgres') || lower.includes('postgresql')) return { type: 'svg', url: 'https://api.iconify.design/logos/postgresql.svg' };
    if (lower.includes('mongodb') || lower.includes('mongo')) return { type: 'svg', url: 'https://api.iconify.design/logos/mongodb-icon.svg' };
    if (lower.includes('redis')) return { type: 'svg', url: 'https://api.iconify.design/logos/redis.svg' };
    if (lower.includes('graphql')) return { type: 'svg', url: 'https://api.iconify.design/logos/graphql.svg' };
    if (lower.includes('tailwind')) return { type: 'svg', url: 'https://api.iconify.design/logos/tailwindcss-icon.svg' };
    if (lower.includes('nextjs') || lower.includes('next.js')) return { type: 'svg', url: 'https://api.iconify.design/logos/nextjs-icon.svg' };
    if (lower.includes('vite')) return { type: 'svg', url: 'https://api.iconify.design/logos/vitejs.svg' };
    if (lower.includes('tensorflow')) return { type: 'svg', url: 'https://api.iconify.design/logos/tensorflow.svg' };
    if (lower.includes('pytorch')) return { type: 'svg', url: 'https://api.iconify.design/logos/pytorch.svg' };
    if (lower.includes('flutter')) return { type: 'svg', url: 'https://api.iconify.design/logos/flutter.svg' };
    if (lower.includes('vercel')) return { type: 'svg', url: 'https://api.iconify.design/logos/vercel-icon.svg' };
    if (lower.includes('cloudflare')) return { type: 'svg', url: 'https://api.iconify.design/logos/cloudflare-icon.svg' };

    // 2. Domain favicons for known company names
    if (lower.includes('apple') || lower.includes('google') || lower.includes('microsoft') ||
        lower.includes('amazon') || lower.includes('meta') || lower.includes('openai') ||
        lower.includes('nvidia') || lower.includes('tesla') || lower.includes('netflix') ||
        lower.includes('spotify') || lower.includes('uber') || lower.includes('airbnb')) {
      return { type: 'svg', url: getDomainFaviconUrl(lower) };
    }

    // 3. Emoji fallback for general topics
    const emoji = getEmojiForTopic(titleText);
    if (emoji) return { type: 'emoji', char: emoji };

    return null;
  };

  // Renders icon (svg or emoji) before heading text
  const renderHeadingIcon = (icon: { type: 'svg'; url: string } | { type: 'emoji'; char: string } | null) => {
    if (!icon) return null;
    if (icon.type === 'emoji') return <span className="mr-1 text-base select-none" aria-hidden="true">{icon.char}</span>;
    return <ImageAttachment src={icon.url} alt="Logo" />;
  };


  // Components defined once per mount — reads citations via ref to avoid closure staleness.
  // IMPORTANT: empty dep array is intentional. All dynamic data is accessed via citationsRef.
  const components = useMemo(
    () => ({
      pre({ children }: any) {
        return children;
      },
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        if (!inline && match) {
          return <CodeBlock code={String(children)} language={match[1]} />;
        }
        const textChild = String(children || '').trim();
        if (textChild.includes('![') && textChild.includes('](')) {
          const imgMatch = /!\[([^\]]*)\]\(([^)]+)\)/.exec(textChild);
          if (imgMatch) {
            return <ImageAttachment src={imgMatch[2]} alt={imgMatch[1]} />;
          }
        }
        return (
          <code
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-muted/60 border border-border/60 text-primary text-[13px] font-mono"
            {...props}
          >
            {children}
          </code>
        );
      },
      h1: ({ children }: any) => {
        const text = typeof children === 'string' ? children : (Array.isArray(children) ? children.map((c: any) => typeof c === 'string' ? c : '').join('') : '');
        const hasExistingImg = hasImageChild(children);
        const icon = !hasExistingImg ? getTopicIcon(text) : null;
        return (
          <h1 className="text-base md:text-lg font-sans font-semibold tracking-tight text-foreground mt-4 mb-2 pb-1 border-b border-border animate-smooth-reveal flex items-center gap-2">
            {renderHeadingIcon(icon)}
            <span>{children}</span>
          </h1>
        );
      },
      h2: ({ children }: any) => {
        const text = typeof children === 'string' ? children : (Array.isArray(children) ? children.map((c: any) => typeof c === 'string' ? c : '').join('') : '');
        const hasExistingImg = hasImageChild(children);
        const icon = !hasExistingImg ? getTopicIcon(text) : null;
        return (
          <h2 className="text-sm md:text-base font-sans font-semibold tracking-tight text-foreground mt-3.5 mb-1.5 animate-smooth-reveal flex items-center gap-2">
            {renderHeadingIcon(icon)}
            <span>{children}</span>
          </h2>
        );
      },
      h3: ({ children }: any) => {
        const text = typeof children === 'string' ? children : (Array.isArray(children) ? children.map((c: any) => typeof c === 'string' ? c : '').join('') : '');
        const hasExistingImg = hasImageChild(children);
        const icon = !hasExistingImg ? getTopicIcon(text) : null;
        return (
          <h3 className="text-xs md:text-sm font-sans font-semibold tracking-tight text-foreground/90 mt-3 mb-1 animate-smooth-reveal flex items-center gap-2">
            {renderHeadingIcon(icon)}
            <span>{children}</span>
          </h3>
        );
      },

      // Use div instead of p to allow block-level children (e.g. ImageAttachment renders a div).
      // Styled identically to a paragraph — avoids the `<div> inside <p>` hydration error.
      p: ({ children }: any) => (
        <div className="text-[13.5px] md:text-[14px] font-sans antialiased leading-[1.6] tracking-[0.01em] text-foreground/90 my-2 animate-smooth-reveal">{children}</div>
      ),
      ul: ({ children }: any) => (
        <ul className="list-disc pl-5 space-y-1 my-2 text-[13.5px] md:text-[14px] font-sans antialiased text-foreground/85 animate-smooth-reveal">{children}</ul>
      ),
      ol: ({ children }: any) => (
        <ol className="list-decimal pl-5 space-y-1 my-2 text-[13.5px] md:text-[14px] font-sans antialiased text-foreground/85 animate-smooth-reveal">{children}</ol>
      ),
      li: ({ children }: any) => <li className="leading-snug pl-0.5">{children}</li>,
      strong: ({ children }: any) => (
        <strong className="font-semibold text-foreground">{children}</strong>
      ),
      em: ({ children }: any) => <em className="italic text-foreground/90">{children}</em>,
      blockquote: ({ children }: any) => (
        <blockquote className="my-2 py-2 px-3 bg-muted/40 border-l-3 border-primary/80 rounded-r-lg text-xs font-sans text-foreground/90 shadow-xs animate-smooth-reveal">
          {children}
        </blockquote>
      ),
      hr: () => <div className="my-3 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />,
      a: ({ href, children }: any) => {
        if (href?.startsWith('#cite-')) {
          const id = href.replace('#cite-', '');
          // Read from ref — avoids stale closure without recreating the object
          const cite = citationsRef.current?.find((c) => c.id === id || String(c.index) === id);
          if (cite) {
            return <CitationCard citation={cite} />;
          }
          return (
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center justify-center min-w-[16px] h-4 ml-0.5 px-1 text-[9px] font-bold text-primary bg-primary/10 rounded-md hover:bg-primary/20 hover:scale-110 transition-all align-super no-underline cursor-pointer"
            >
              {id}
            </a>
          );
        }
        if (href?.startsWith('http://') || href?.startsWith('https://')) {
          return <InlineSourceAvatar href={href}>{children}</InlineSourceAvatar>;
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-semibold hover:underline underline-offset-4 decoration-primary/40"
          >
            {children}
          </a>
        );
      },
      table: ({ children }: any) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-border/80 bg-card/40 shadow-xs">
          <table className="w-full text-sm border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }: any) => <thead className="bg-muted/70 border-b border-border">{children}</thead>,
      th: ({ children }: any) => (
        <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {children}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="px-4 py-2.5 text-foreground/90 border-b border-border/40 hover:bg-muted/20 transition-colors">{children}</td>
      ),
      // Inline section illustration — rich interactive ImageArtifactCard (compact book-plate size)
      img: ({ src, alt }: any) => {
        if (!src) return null;
        const isExternal = typeof src === 'string' && src.startsWith('https://');
        if (!isExternal) return <ImageAttachment src={src} alt={alt || ''} />;
        return (
          <ImageArtifactCard
            imageUrl={src}
            prompt={alt || 'Visual Reference'}
            engine="Verified Media"
          />
        );
      },
      // Inline HD video illustration — rich interactive VideoArtifactCard
      video: ({ src, title, poster }: any) => {
        if (!src) return null;
        return (
          <div className="my-3.5 max-w-2xl">
            <VideoArtifactCard
              videoUrl={src}
              previewUrl={poster || ''}
              title={title || 'HD Video Reference'}
              aspectRatio="16:9"
            />
          </div>
        );
      },
      // Inline atmospheric soundtrack — luxury editorial AudioArtifactCard
      audio: ({ src, title, artist }: any) => {
        if (!src) return null;
        return (
          <div className="my-3.5 max-w-xl">
            <AudioArtifactCard
              audioUrl={src}
              title={title || 'Atmospheric Chapter Soundtrack'}
              artist={artist || 'Audio Soundtrack'}
            />
          </div>
        );
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpenLightbox]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeRaw, rehypeKatex]} components={components}>
      {processedContent}
    </ReactMarkdown>
  );
},
(prevProps, nextProps) => {
  if (prevProps.content !== nextProps.content) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if ((prevProps.citations?.length || 0) !== (nextProps.citations?.length || 0)) return false;
  return true;
});
MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MarkdownContent: React.FC<{
  content: string;
  blocks?: string[];
  isStreaming?: boolean;
  citations?: Citation[];
  images?: Array<{ url?: string; name?: string; engine?: string; data?: string; mimeType?: string; aspectRatio?: string }>;
  videos?: Array<{ url?: string; previewUrl?: string; title?: string; duration?: number; source?: string; author?: string; authorUrl?: string }>;
  audios?: Array<{ url?: string; title?: string; artist?: string; duration?: number; source?: string; tags?: string; previewUrl?: string }>;
  onOpenLightbox?: (url: string, prompt: string, engine?: string) => void;
}> = memo(({ content, blocks, isStreaming, citations, images, videos, audios, onOpenLightbox }) => {
  // Hide raw XML artifact tags from being rendered in text bubble
  const cleanText = (text: string) => {
    return text.replace(/<nyx_artifact[\s\S]*?(?:<\/nyx_artifact>|$)/g, '');
  };

  const cleanedContent = cleanText(content);
  // Distribute verified images, videos, and music contextually into their respective subtopics / chapters
  const mediaEnhancedContent = useMemo(
    () => distributeMediaIntoMarkdown(cleanedContent, images, videos, audios),
    [cleanedContent, images, videos, audios]
  );

  const blocksToRender = blocks?.length 
    ? blocks.map(b => cleanText(b)) 
    : [mediaEnhancedContent];
  
  return (
    <div className="prose-nyx w-full">
      {blocksToRender.map((block, idx) => {
        const isLastBlock = idx === blocksToRender.length - 1;
        return (
          <MemoizedMarkdownBlock
            key={idx}
            content={block}
            isStreaming={isStreaming && isLastBlock}
            citations={citations}
            onOpenLightbox={onOpenLightbox}
          />
        );
      })}
      {isStreaming && <StreamingCursor />}
    </div>
  );
},
(prevProps, nextProps) => {
  if (prevProps.content !== nextProps.content) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.blocks?.length !== nextProps.blocks?.length) return false;
  if ((prevProps.citations?.length || 0) !== (nextProps.citations?.length || 0)) return false;
  if ((prevProps.images?.length || 0) !== (nextProps.images?.length || 0)) return false;
  if ((prevProps.videos?.length || 0) !== (nextProps.videos?.length || 0)) return false;
  return true;
});
MarkdownContent.displayName = 'MarkdownContent';

// ---------------------------------------------------------------------------
// TTS Speaker Button
const TtsSpeakerButton: React.FC<{
  isSpeaking: boolean;
  onToggle: () => void;
}> = memo(({ isSpeaking, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      title={isSpeaking ? 'Stop reading' : 'Read aloud'}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium tracking-normal"
    >
      {isSpeaking ? <VolumeX size={10} /> : <Volume2 size={10} />}
      <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
    </button>
  );
});
TtsSpeakerButton.displayName = 'TtsSpeakerButton';

// ---------------------------------------------------------------------------
// Message Actions (Edit, Regenerate, Branch)
// ---------------------------------------------------------------------------

export const MessageActions: React.FC<{
  index: number;
  content: string;
  isPinned?: boolean;
  onEdit?: (index: number, content: string) => void;
  onRegenerate?: (index: number) => void;
  onBranch?: (index: number) => void;
  onPinToggle?: (index: number) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  msgId: string;
  isUser: boolean;
  activeModel?: string;
  siblingCount?: number;
  currentIndex?: number;
  onBranchChange?: (index: number, branchOffset: number) => void;
}> = memo(
  ({
    index,
    content,
    isPinned,
    onEdit,
    onRegenerate,
    onBranch,
    onPinToggle,
    onCopy,
    copiedId,
    msgId,
    isUser,
    activeModel,
    siblingCount,
    currentIndex,
    onBranchChange,
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(content);
    const editRef = useRef<HTMLTextAreaElement>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const handleTtsToggle = useCallback(() => {
      if (isSpeaking) {
        tts.stop();
        setIsSpeaking(false);
      } else {
        setIsSpeaking(true);
        tts.speak(content).finally(() => setIsSpeaking(false));
      }
    }, [content, isSpeaking]);

    useEffect(() => {
      if (isEditing) {
        editRef.current?.focus();
        editRef.current?.setSelectionRange(editValue.length, editValue.length);
      }
    }, [isEditing]);

    const handleEditSubmit = () => {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== content) {
        onEdit?.(index, trimmed);
      }
      setIsEditing(false);
    };

    if (isEditing) {
      return (
        <div className="mt-2 space-y-2">
          <textarea
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) handleEditSubmit();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-full min-h-[80px] bg-card border border-border rounded-md p-3 text-sm text-foreground/90 resize-y focus:outline-none focus:border-primary/30"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleEditSubmit}
              className="px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Save & Submit
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-md bg-muted border border-border text-muted-foreground text-[11px] font-semibold hover:bg-muted/80 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`mt-3 flex items-center gap-1 focus-within:opacity-100 transition-opacity duration-200 ${isSpeaking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {siblingCount && siblingCount > 1 && currentIndex !== undefined && (
          <div className="flex items-center gap-1 mr-2 px-1 py-1 rounded-md bg-muted/30 border border-border/50">
            <button
              onClick={() => onBranchChange?.(index, -1)}
              disabled={currentIndex <= 0}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronDown size={12} className="rotate-90" />
            </button>
            <span className="text-[10px] font-mono font-medium text-muted-foreground px-1 select-none">
              {currentIndex + 1} / {siblingCount}
            </span>
            <button
              onClick={() => onBranchChange?.(index, 1)}
              disabled={currentIndex >= siblingCount - 1}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronDown size={12} className="-rotate-90" />
            </button>
          </div>
        )}
        <button
          onClick={() => onCopy(content, msgId)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium tracking-normal"
        >
          {copiedId === msgId ? (
            <>
              <Check size={10} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={10} />
              <span>Copy</span>
            </>
          )}
        </button>

        {isUser && onEdit && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium"
          >
            <Pencil size={10} />
            <span>Edit</span>
          </button>
        )}

        {!isUser && onRegenerate && (
          <button
            onClick={() => onRegenerate(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium"
            title={`Regenerate with ${activeModel || 'current model'}`}
          >
            <RefreshCw size={10} />
            <span>Regenerate</span>
          </button>
        )}


        {!isUser && content && <TtsSpeakerButton isSpeaking={isSpeaking} onToggle={handleTtsToggle} />}

        {onPinToggle && (
          <button
            onClick={() => onPinToggle(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium"
            title={isPinned ? 'Unpin message' : 'Pin message'}
          >
            {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
            <span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
        )}
      </div>
    );
  }
);
MessageActions.displayName = 'MessageActions';

// ---------------------------------------------------------------------------
// Feedback Buttons
// ---------------------------------------------------------------------------

export const FeedbackButtons: React.FC<{
  msg: ChatMessage;
  submitReward?: (id: string, reward: number) => void;
}> = memo(({ msg, submitReward }) => {
  const [reward, setReward] = useState<number | undefined>(msg.reward ?? undefined);

  const handleReward = (value: number) => {
    if (!msg.rolloutId || reward !== undefined) return;
    setReward(value);
    submitReward?.(msg.rolloutId, value);
    toast.info(value === 1 ? 'Thanks for the feedback!' : "Feedback noted. We'll improve.", {
      icon: value === 1 ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />,
    });
  };

  if (!msg.rolloutId || !submitReward) return null;

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
      <span className="text-[8.5px] text-muted-foreground font-bold uppercase tracking-wider select-none">
        Helpful?
      </span>
      <button
        onClick={() => handleReward(1)}
        disabled={reward !== undefined}
        className={`p-1 rounded transition-colors cursor-pointer ${
          reward === 1 ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'
        } ${reward !== undefined ? 'opacity-50 cursor-default' : ''}`}
      >
        <ThumbsUp size={11} />
      </button>
      <button
        onClick={() => handleReward(0)}
        disabled={reward !== undefined}
        className={`p-1 rounded transition-colors cursor-pointer ${
          reward === 0 ? 'text-red-400' : 'text-muted-foreground hover:text-red-400'
        } ${reward !== undefined ? 'opacity-50 cursor-default' : ''}`}
      >
        <ThumbsDown size={11} />
      </button>
    </div>
  );
});
FeedbackButtons.displayName = 'FeedbackButtons';

// ---------------------------------------------------------------------------
// Artifact Card (Replaced by ArtifactViewer)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Sources Toggle (compact replacement for SearchResultsPanel)
// ---------------------------------------------------------------------------

export const SourcesToggle: React.FC<{
  citations: Array<{ id: string; index: number; title: string; url: string; snippet: string }>;
}> = memo(({ citations }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium tracking-normal"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{citations.length} source{citations.length !== 1 ? 's' : ''}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 flex flex-col gap-1.5">
              {citations.map((cite) => (
                <a
                  key={cite.id}
                  href={cite.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-0.5 px-3 py-2 rounded-md bg-muted/20 border border-border/50 hover:bg-muted/40 transition-colors text-left text-[12px]"
                >
                  <span className="font-medium text-foreground/90 truncate">{cite.title || cite.url}</span>
                  {cite.snippet && (
                    <span className="text-muted-foreground line-clamp-2">{cite.snippet}</span>
                  )}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
SourcesToggle.displayName = 'SourcesToggle';

const ErrorCard: React.FC<{
  message: string;
  isHighDemand: boolean;
  onRetry?: () => void;
}> = ({ message, isHighDemand, onRetry }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyDiagnostics = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Diagnostics copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const bgClass = isHighDemand 
    ? "border-orange-500/20 bg-orange-500/[0.03] dark:bg-[oklch(0.75_0.18_65/0.05)] shadow-orange-950/5 text-orange-200"
    : "border-red-500/20 bg-red-500/[0.03] dark:bg-[oklch(0.63_0.22_28.5/0.05)] shadow-red-950/5 text-red-200";

  const badgeClass = isHighDemand
    ? "bg-orange-500/10 text-orange-300 border-orange-500/20"
    : "bg-red-500/10 text-red-300 border-red-500/20";

  const iconClass = isHighDemand ? "text-orange-400 animate-pulse" : "text-red-400";
  const title = isHighDemand ? "High Server Load Detected" : "Execution Engine Alert";

  return (
    <div className={`my-3 rounded-xl border p-4 shadow-sm backdrop-blur-md transition-all duration-300 ${bgClass}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-background/50 border border-border/10 shrink-0 ${iconClass}`}>
          <AlertTriangle className="w-4 h-4 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-semibold text-[13px] tracking-tight">
              {title}
            </h4>
            <span className={`text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border ${badgeClass}`}>
              {isHighDemand ? "429 Limit" : "Inference Error"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words max-w-full font-sans">
            {isHighDemand 
              ? "The inference server is currently experiencing extremely high volume. Your request has been queued but rate-limited."
              : "An unexpected error occurred during execution. This could be due to a backend crash or configuration misalignment."}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onRetry && (
            <button 
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-foreground/10 hover:bg-foreground/15 text-foreground transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
              <span>Retry Request</span>
            </button>
          )}
          <span className="text-[10px] text-muted-foreground/60 select-none">
            Or select another model in the menu to retry
          </span>
        </div>

        <button 
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
        >
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{showLogs ? "Hide Diagnostics" : "Inspect Diagnostics"}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showLogs ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showLogs && (
        <div className="mt-3 pt-3 border-t border-border/10">
          <div className="flex items-center justify-between gap-2 mb-1.5 select-none">
            <span className="text-[10px] font-mono text-muted-foreground/50">Raw Engine Trace</span>
            <button 
              onClick={copyDiagnostics}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? "Copied" : "Copy Log"}</span>
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-zinc-950/80 text-[11px] font-mono text-zinc-300 overflow-x-auto border border-border/20 max-h-48 leading-relaxed scrollbar-thin">
            {message}
          </pre>
        </div>
      )}
    </div>
  );
};

const MessageBubble = React.memo<MessageBubbleProps>(
  ({
    msg,
    index,
    isLast,
    isStreaming,
    onCopy,
    copiedId,
    submitReward,
    onEdit,
    onRegenerate,
    onBranch,
    onBranchChange,
    activeModel,
    onArtifactClick,
    approveTool,
    rejectTool,
    onPinToggle,
    onOpenLightbox,
  }) => {
    const isUser = msg.role === 'user';
    const isSetupMessage = !isUser && typeof msg.content === 'string' && (
      msg.content.startsWith('⚙️') || 
      msg.content.includes('Auto-loading Local Model') || 
      msg.content.includes('Local Model Not Loaded')
    );
    const [isExpanded, setIsExpanded] = useState(false);
    const msgId = `${msg.timestamp}-${index}`;
    const reasoningEnabled = isReasoningModel(msg.model || activeModel);
    
    // Hide internal tool result/error feedback messages from rendering in the chat UI
    if (isUser && typeof msg.content === 'string' && (
      msg.content.startsWith('[TOOL_RESULT for') || 
      msg.content.startsWith('[TOOL_ERROR for') || 
      msg.content.startsWith('[AVAILABLE TOOLS]')
    )) {
      return null;
    }

    // Process <think> tags natively from content if reasoning is empty or merged
    let parsedReasoning = msg.reasoning || '';
    let parsedContent = msg.content || '';

    // Clean inline tool tags and trailing redundant references sections from assistant messages
    if (!isUser && typeof parsedContent === 'string') {
      parsedContent = parsedContent
        .replace(/\[TOOL_RESULT for [^\]]+\]:\s*[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '')
        .replace(/\[TOOL_ERROR for [^\]]+\]:\s*[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '')
        .replace(/\*Lucifer Executing Tool:\s*`[^`]+`\.\.\.\*/g, '')
        .replace(/(?:^|\n)#+\s*(?:📌\s*)?(?:Footnote Citations|Citations|References|Sources)[\s\S]*$/gi, '')
        .replace(/(?:^|\n)📌\s*Footnote Citations[\s\S]*$/gi, '')
        .trim();
    }
    
    const thinkStartMatch = parsedContent.match(/<(?:think|thought|thinking)>/i);
    if (thinkStartMatch) {
      const startIndex = thinkStartMatch.index!;
      const endMatch = parsedContent.match(/<\/(?:think|thought|thinking)>/i);
      
      const innerText = (endMatch && typeof endMatch.index !== 'undefined' && endMatch.index > startIndex)
        ? parsedContent.substring(startIndex + thinkStartMatch[0].length, endMatch.index).trim()
        : parsedContent.substring(startIndex + thinkStartMatch[0].length).trim();

      const outsideText = (endMatch && typeof endMatch.index !== 'undefined' && endMatch.index > startIndex)
        ? (parsedContent.substring(0, startIndex) + parsedContent.substring(endMatch.index + endMatch[0].length)).trim()
        : parsedContent.substring(0, startIndex).trim();

      if (!reasoningEnabled) {
        // Non-reasoning model outputted <think> — strip tags, keep content
        parsedContent = outsideText ? `${outsideText}\n${innerText}` : innerText;
      } else if (!outsideText && innerText) {
        // Safety net: Reasoning model put 100% of text in <think> — show innerText as message content
        parsedContent = innerText;
      } else {
        parsedReasoning = parsedReasoning ? `${parsedReasoning}\n${innerText}` : innerText;
        parsedContent = outsideText;
      }
    }

    // Ref-guarded streaming artifact detection — avoids inline regex every render
    const artifactContentRef = useRef('');
    const streamingArtifacts: any[] = useMemo(() => {
      if (!isStreaming || !isLast || !parsedContent) return [];
      // Skip if content hasn't changed since last detection
      if (artifactContentRef.current === parsedContent) return [];
      
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
      const detected: any[] = [];
      let match;
      while ((match = codeBlockRegex.exec(parsedContent)) !== null) {
        const isClosed = parsedContent.substring(match.index).includes('```', match[1].length + 3);
        if (!isClosed) {
          const lang = match[1]?.toLowerCase();
          const isArtifactLang = ['html', 'htm', 'react', 'tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript', 'python', 'json', 'csv', 'mermaid', 'svg', 'markdown', 'md'].includes(lang);
          if (isArtifactLang) {
            detected.push({ id: 'streaming-artifact', type: 'code', title: 'Generating...', content: '' });
          }
        }
      }
      artifactContentRef.current = parsedContent;
      return detected;
    }, [isStreaming, isLast, parsedContent]);

    // Show "Thinking..." spinner ONLY when streaming has started but no content or reasoning yet
    const isThinking =
      isStreaming && !parsedContent && !parsedReasoning &&
      (!msg.toolCalls || msg.toolCalls.length === 0) &&
      (msg.status === 'loading' || msg.status === undefined) &&
      reasoningEnabled;
      
    // Used to show the animated loader instead of the cat icon during response generation
    const isLoadingIcon = (msg.status === 'loading' || msg.status === undefined) && (isStreaming && isLast);

    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}
      >
        {isUser ? (
          <div className="max-w-[85%] sm:max-w-[75%] animate-fade-in">
            <div className="py-3 px-4.5 bg-indigo-600/10 hover:bg-indigo-600/15 border border-indigo-500/20 rounded-2xl rounded-tr-xs transition-all shadow-md backdrop-blur-md text-slate-100 dark:text-slate-100">
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.attachments.map((att, i) => (
                    <FileAttachment
                      key={i}
                      name={att.name}
                      size={att.size}
                      type={att.type}
                      mimeType={att.mimeType}
                    />
                  ))}
                </div>
              )}
              {(() => {
                const shouldCollapse = msg.content.length > 350;
                const displayText = shouldCollapse && !isExpanded 
                  ? msg.content.slice(0, 300) + '...' 
                  : msg.content;
                return (
                  <>
                    <div className="text-[14.5px] font-sans font-normal leading-relaxed text-slate-200 dark:text-slate-100 select-text whitespace-pre-wrap tracking-tight">
                      {displayText}
                    </div>
                    {shouldCollapse && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-2 text-[10px] font-mono font-bold uppercase tracking-wider text-accent hover:text-accent/80 transition-all cursor-pointer flex items-center gap-1.5 outline-none select-none"
                      >
                        <span>{isExpanded ? 'Show Less' : 'Show More'}</span>
                        <ChevronDown
                          size={10}
                          className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
                        />
                      </button>
                    )}
                  </>
                );
              })()}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {msg.images.map((img, i) => (
                    <ImageAttachment
                      key={i}
                      src={
                        img.url ||
                        (img.data
                          ? img.data.startsWith('data:')
                            ? img.data
                            : `data:${img.mimeType || 'image/png'};base64,${img.data}`
                          : '')
                      }
                      alt={img.name}
                    />
                  ))}
                </div>
              )}
            </div>
            <MessageActions
              index={index}
              content={msg.content}
              onEdit={onEdit}
              onCopy={onCopy}
              copiedId={copiedId}
              msgId={msgId}
              isUser={true}
              siblingCount={msg.siblingCount}
              currentIndex={msg.currentIndex}
              onBranchChange={onBranchChange}
              isPinned={msg.isPinned}
              onPinToggle={onPinToggle}
            />
          </div>
        ) : (
          <div className="flex flex-col w-full animate-fade-in relative">
            {/* Clean Header with Message-Specific Model Resolution */}
            {(() => {
              if (isSetupMessage) return null;
              const rawModel: any = msg.model || activeModel;
              const messageModel = typeof rawModel === 'string'
                ? rawModel
                : (rawModel && typeof rawModel === 'object' ? (rawModel.id || rawModel.name || '') : String(rawModel || ''));

              if (!messageModel || String(messageModel).toLowerCase() === 'default') return null;
              const found = AVAILABLE_MODELS.find((m) => m.id === messageModel);
              const displayName = found ? found.name : (rawModel && typeof rawModel === 'object' ? (rawModel.name || messageModel) : messageModel);
              if (!displayName || String(displayName).toLowerCase() === 'default') return null;

              if (
                !(msg.content ||
                  msg.reasoning ||
                  (msg.toolCalls && msg.toolCalls.length > 0) ||
                  msg.status === 'loading')
              ) {
                return null;
              }

              const stateColor = msg.status === 'error' 
                ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
                : isStreaming && isLast 
                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : 'bg-violet-400 dark:bg-violet-500 shadow-[0_0_8px_rgba(167,139,250,0.5)]';

              return (
                <div className="flex items-center gap-2 mb-1.5 select-none">
                  <div className={`w-1.5 h-1.5 rounded-full ${stateColor}`} />
                  <span className="text-[9px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
                    {displayName}
                  </span>
                </div>
              );
            })()}

            <div className="flex w-full gap-3 items-start relative">

              <div className="flex-1 min-w-0">
                {isSetupMessage && (
                  <FourDotsWaveLoader />
                )}

                {/* Error state */}
                {msg.status === 'error' && (
                  (() => {
                    const isHighDemand = !!(msg.content && (msg.content.includes('[UNAVAILABLE]') || msg.content.toLowerCase().includes('high demand') || msg.content.includes('429')));
                    const errorMessage = msg.content || "Error: Generation failed. Please check your model settings or connection.";
                    const cleanErrorMessage = errorMessage.startsWith("Error: Error:") 
                      ? errorMessage.substring(7) 
                      : errorMessage;
                    return (
                      <ErrorCard 
                        message={cleanErrorMessage}
                        isHighDemand={isHighDemand}
                        onRetry={onRegenerate ? () => onRegenerate(index) : undefined}
                      />
                    );
                  })()
                )}

                {/* Stopped state */}
                {msg.status === 'stopped' && (
                  <p className="text-sm text-muted-foreground py-1 italic flex items-center gap-2">
                    <Square size={10} className="text-muted-foreground" />
                    Generation stopped by user.
                  </p>
                )}

                {/* Loading / Thinking state (during reasoning or initial Formulation) */}
                {(isThinking || parsedReasoning) && (
                  <div className="pl-0">
                    <ThinkingBlock 
                      content={parsedReasoning} 
                      isStarting={isThinking && !parsedReasoning}
                      responseContent={parsedContent}
                      thinkingTimeMs={msg.thinkingTimeMs}
                      isComplete={
                        (!isStreaming && msg.status !== 'loading') || 
                        (!!parsedContent && parsedContent.length > 0) || 
                        (!!msg.toolCalls && msg.toolCalls.length > 0)
                      }
                    />
                  </div>
                )}

                {/* Simple Loader (when reasoning is off but waiting for first token) */}
                {isLoadingIcon && !isThinking && !parsedReasoning && !parsedContent && (!msg.toolCalls || msg.toolCalls.length === 0) && (
                  <FourDotsWaveLoader />
                )}

                {/* Content rendering */}
                {(parsedContent || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                  <div className="pl-0">
                    {/* Tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        {(() => {
                          const retrievalNames = ['search', 'read', 'memory', 'query', 'retrieve'];
                          const getToolName = (tool: any) => tool?.function?.name || tool?.name || tool?.tool || '';
                          const isRetrieval = (tool: any) => {
                            const name = String(getToolName(tool) || '');
                            return retrievalNames.some(rn => name.toLowerCase().includes(rn));
                          };
                          
                          const retrievalTools = msg.toolCalls!.map((tool, i) => ({
                            tool,
                            status: tool.status || (isStreaming && isLast && i === msg.toolCalls!.length - 1 ? 'running' : 'completed'),
                            index: i
                          })).filter(t => isRetrieval(t.tool));

                          const otherTools = msg.toolCalls!.map((tool, i) => ({
                            tool,
                            status: tool.status || (isStreaming && isLast && i === msg.toolCalls!.length - 1 ? 'running' : 'completed'),
                            index: i
                          })).filter(t => !isRetrieval(t.tool));

                          return (
                            <>
                              {retrievalTools.length > 0 && <ContextIngestionCard tools={retrievalTools} />}
                              {otherTools.map(t => (
                                <ToolCallCard
                                  key={t.tool.id || t.index}
                                  tool={t.tool}
                                  status={t.status as 'pending' | 'running' | 'success' | 'error'}
                                />
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Main content with inline contextual media */}
                    {parsedContent && msg.status !== 'error' && !isSetupMessage && (
                      <>
                        <MarkdownContent
                          content={parsedContent}
                          blocks={(msg as any).blocks}
                          isStreaming={isStreaming && isLast}
                          citations={msg.citations}
                          images={msg.images}
                          videos={(msg as any).videos}
                          audios={(msg as any).audios}
                          onOpenLightbox={onOpenLightbox}
                        />
                      </>
                    )}

                    {/* Tool Approval UI Gate */}
                    {msg.pendingApproval && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="my-4 p-5 rounded-2xl border border-purple-500/30 bg-purple-950/10 dark:bg-purple-950/20 backdrop-blur-md shadow-xl relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-start gap-3.5 relative z-10">
                          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                            <Shield size={18} className="animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                                <span>Lucifer Agent Tool Authorization</span>
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold uppercase tracking-wider border border-purple-500/30">
                                  Action Gate
                                </span>
                              </h4>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Lucifer Supreme Agent requests permission to execute the following tool operation:
                            </p>
                            
                            <div className="mt-3.5 bg-muted/40 border border-border/50 rounded-xl p-3.5 font-mono">
                              <div className="text-[11px] text-purple-300 font-bold mb-2 flex items-center gap-2">
                                <Zap size={12} className="text-purple-400" />
                                <span>{(msg.pendingApproval as any).tool}</span>
                              </div>
                              <pre className="text-[11px] text-foreground/90 whitespace-pre-wrap bg-background/60 p-2.5 rounded-lg border border-border/40 max-h-[200px] overflow-y-auto">
                                {JSON.stringify((msg.pendingApproval as any).input || {}, null, 2)}
                              </pre>
                            </div>

                            <div className="flex items-center gap-3 mt-4">
                              <button
                                onClick={() => {
                                  rejectTool?.(index, (msg.pendingApproval as any).approvalId);
                                  toast.error('Action Rejected', { description: 'Lucifer tool execution cancelled.' });
                                }}
                                className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                              >
                                <X size={14} />
                                Reject Action
                              </button>
                              <button
                                onClick={() => {
                                  approveTool?.(index, (msg.pendingApproval as any).approvalId);
                                  toast.success('Action Approved', { description: 'Executing Lucifer tool...' });
                                }}
                                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold cursor-pointer transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                              >
                                <Check size={14} />
                                Approve & Execute
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Actions */}
                    {!isStreaming && !isSetupMessage && (
                      <>
                        <MessageActions
                          index={index}
                          content={parsedContent || ''}
                          onCopy={onCopy}
                          copiedId={copiedId}
                          msgId={msgId}
                          isUser={false}
                          onRegenerate={onRegenerate}
                          onBranch={onBranch}
                          activeModel={activeModel}
                          siblingCount={msg.siblingCount}
                          currentIndex={msg.currentIndex}
                          isPinned={msg.isPinned}
                          onPinToggle={onPinToggle}
                        />
                        <FeedbackButtons msg={msg} submitReward={submitReward} />
                      </>
                    )}
                  </div>
                )}

                {/* Empty fallback */}
                {!parsedContent &&
                  !parsedReasoning &&
                  (!msg.toolCalls || msg.toolCalls.length === 0) &&
                  msg.status !== 'loading' &&
                  msg.status !== 'error' && (
                    <div className="text-muted-foreground text-xs italic py-1">
                      Empty response from model.
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check to prevent re-renders when history array gets cloned during streaming
    if (prevProps.msg !== nextProps.msg) return false;
    if (prevProps.isLast !== nextProps.isLast) return false;
    if (prevProps.isStreaming !== nextProps.isStreaming) return false;
    if (prevProps.index !== nextProps.index) return false;
    if (prevProps.copiedId !== nextProps.copiedId) return false;
    if (prevProps.activeModel !== nextProps.activeModel) return false;
    // Re-render when images arrive asynchronously (search images, generated assets)
    if ((prevProps.msg.images?.length ?? 0) !== (nextProps.msg.images?.length ?? 0)) return false;
    // Compare stable function references — stale closures will execute otherwise
    if (prevProps.onCopy !== nextProps.onCopy) return false;
    if (prevProps.onRegenerate !== nextProps.onRegenerate) return false;
    if (prevProps.onEdit !== nextProps.onEdit) return false;
    if (prevProps.approveTool !== nextProps.approveTool) return false;
    if (prevProps.rejectTool !== nextProps.rejectTool) return false;
    if (prevProps.onPinToggle !== nextProps.onPinToggle) return false;
    if (prevProps.onBranchChange !== nextProps.onBranchChange) return false;
    return true;
  }
);
MessageBubble.displayName = 'MessageBubble';

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

const EmptyState: React.FC<{
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
}> = memo(({ suggestedPrompts, onSuggestedPromptClick }) => {
  // Only render chips when model-generated suggestions are provided
  const chips = (suggestedPrompts || []).slice(0, 4);
  if (chips.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-primary/[0.025] rounded-full blur-[120px] pointer-events-none select-none -z-10" />
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="text-[22px] font-semibold tracking-tight text-foreground leading-none"
        >
          Chat
        </motion.h1>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6 gap-8 relative overflow-hidden"
    >
      {/* Ambient radial — very subtle, non-distracting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-primary/[0.025] rounded-full blur-[120px] pointer-events-none select-none -z-10" />

      {/* Identity text */}
      <div className="space-y-1.5">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="text-[22px] font-semibold tracking-tight text-foreground leading-none"
        >
          Chat
        </motion.h1>
      </div>

      {/* Prompt chips — stagger 30ms per chip, max 90ms total */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full">
        {chips.map((p, idx) => (
          <motion.button
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 + idx * 0.03, duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSuggestedPromptClick?.(p)}
            className="group p-3.5 text-[12px] font-medium text-left rounded-lg bg-card border border-border/60 text-foreground/60 hover:text-foreground hover:border-border hover:bg-muted/50 transition-colors duration-150 cursor-pointer flex items-center justify-between gap-3"
          >
            <span className="leading-snug">{p}</span>
            <span className="text-primary/40 group-hover:text-primary/70 shrink-0 transition-colors duration-150 text-[11px]">↵</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
});
EmptyState.displayName = 'EmptyState';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  history,
  activeStreamMessage,
  activeAgent,
  isLoading,
  onCopy,
  copiedId,
  suggestedPrompts,
  onSuggestedPromptClick,
  submitReward,
  onEditMessage,
  onRegenerate,
  onBranchFromMessage,
  activeModel,
  onArtifactClick,
  onBranchChange,
  approveTool,
  rejectTool,
  onPinToggle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const webSearchEnabled = useAppStore(state => state.webSearchEnabled);

  // Lightbox viewer state for inspect / zoom / pan
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    imageUrl: string;
    prompt: string;
    engine?: string;
  }>({
    isOpen: false,
    imageUrl: '',
    prompt: '',
    engine: undefined,
  });

  const handleOpenLightbox = useCallback((imageUrl: string, prompt: string, engine?: string) => {
    setLightbox({ isOpen: true, imageUrl, prompt, engine });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightbox(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Build the display list: history + active stream message (if any)
  const allMessages = useMemo(
    () => (activeStreamMessage ? [...history, activeStreamMessage] : history),
    [history, activeStreamMessage]
  );

  const { virtualizer, scrollToBottom } = useVirtualMessages(allMessages, scrollContainerRef);

  const jumpToBottom = useCallback(() => {
    scrollToBottom(true);
    setAutoScroll(true);
    setShowJumpToBottom(false);
  }, [scrollToBottom]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 50;

    if (isAtBottom) {
      if (!autoScroll) setAutoScroll(true);
      if (showJumpToBottom) setShowJumpToBottom(false);
    } else {
      if (autoScroll) setAutoScroll(false);
      if (!showJumpToBottom) setShowJumpToBottom(true);
    }
  }, [autoScroll, showJumpToBottom]);

  // Auto-scroll: use the virtualizer's scrollToIndex so it works correctly
  // with the virtual DOM. rAF ensures we don't fight in-progress paint cycles.
  useEffect(() => {
    if (!autoScroll || allMessages.length === 0) return;
    requestAnimationFrame(() => scrollToBottom(false));
  }, [allMessages, autoScroll, isLoading, scrollToBottom]);

  // Keyboard shortcut: Escape to stop auto-scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAutoScroll(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden w-full bg-background">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative w-full"
        aria-live="polite"
        aria-atomic="false"
      >
        {history.length === 0 ? (
          isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="flex-1 flex flex-col items-center justify-center min-h-[65vh] gap-4"
            >
              <div className="flex items-center gap-2">
                <FourDotsWaveLoader />
              </div>
            </motion.div>
          ) : (
            <EmptyState
              suggestedPrompts={suggestedPrompts}
              onSuggestedPromptClick={onSuggestedPromptClick}
            />
          )
        ) : (
          <div
            ref={scrollContainerRef}
            className="absolute inset-0 overflow-y-auto custom-scrollbar"
            onScroll={handleScroll}
          >
            {/* Virtual container — height equals the sum of all measured row heights */}
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const msg = allMessages[virtualRow.index];
                const isLast = virtualRow.index === allMessages.length - 1;
                const isStreaming = isLast && (activeStreamMessage ? true : isLoading);

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: virtualRow.start,
                      left: 0,
                      width: '100%',
                    }}
                  >
                    <div className="py-2 px-3 md:px-4 w-full max-w-3xl mx-auto">
                      <MessageBubble
                        msg={msg}
                        index={virtualRow.index}
                        isLast={isLast}
                        isStreaming={isStreaming}
                        onCopy={onCopy}
                        copiedId={copiedId}
                        submitReward={submitReward}
                        onEdit={onEditMessage}
                        onRegenerate={onRegenerate}
                        onBranch={onBranchFromMessage}
                        onBranchChange={onBranchChange}
                        activeModel={activeModel}
                        onArtifactClick={onArtifactClick}
                        approveTool={approveTool}
                        rejectTool={rejectTool}
                        onPinToggle={onPinToggle}
                        onOpenLightbox={handleOpenLightbox}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Jump to bottom button */}
      <AnimatePresence>
        {showJumpToBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            onClick={jumpToBottom}
            className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3.5 py-2.5 rounded-md bg-card/90 border border-border text-foreground/70 hover:text-foreground shadow-sm text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-all hover:bg-muted/90 cursor-pointer"
          >
            <ArrowDown className="w-3 h-3" />
            Latest
            {isLoading && <span className="w-1.5 h-1.5 rounded-md bg-primary animate-pulse" />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* New messages indicator */}
      {!autoScroll && isLoading && (
        <div className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-2 pointer-events-none">
          <div className="px-3 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] text-primary font-semibold animate-pulse">
            Generating...
          </div>
        </div>
      )}
      {/* Image Inspect Lightbox Modal */}
      <ImageLightbox
        isOpen={lightbox.isOpen}
        imageUrl={lightbox.imageUrl}
        prompt={lightbox.prompt}
        engine={lightbox.engine}
        onClose={handleCloseLightbox}
      />
    </div>
  );
};


