// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatMessageList.tsx
 * @description Production-grade message list with reasoning display,
 *   tool visualization, branching, and Claude/Kimi-parity UX.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CopyIcon as Copy,
  CheckIcon as Check,
  TerminalIcon as Terminal,
  ThumbsUpIcon as ThumbsUp,
  ThumbsDownIcon as ThumbsDown,
  GitBranchIcon as GitBranch,
  ChevronDownIcon as ChevronDown,
  ChevronRightIcon as ChevronRight,
  XIcon as X,
  SparklesIcon as Sparkles,
  DownloadIcon as Download,
} from '@animateicons/react/lucide';
import {
  ArrowDown,
  Pencil,
  RefreshCw,
  Wrench,
  FileText,
  Image as ImageIcon,
  Clock,
  AlertTriangle,
  Loader2,
  Square,
  Volume2,
  VolumeX,
  Pin,
  PinOff,
  Shield,
  Zap,
} from 'lucide-react';
import { ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { CodeBlock } from '../../../components/chat/CodeBlock';
import {
  getDomainFaviconUrl,
  getEmojiForTopic,
  isYouTubeUrl,
  extractYouTubeVideoId,
} from '../../../core/services/mediaEngine';

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
import { YouTubePlayerCard } from './YouTubePlayerCard';
import { ImageLightbox } from './ImageLightbox';
import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';
import { tts } from '@src/features/voice/tts';
import { MessageBubble } from './MessageBubble';
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
  onOpenLightbox?: (url?: string, prompt?: string, engine?: string) => void;
}

import {
  ToolCallCard,
  formatToolAction,
  ContextIngestionCard,
  InlineSourceAvatar,
  ImageAttachment,
  FileAttachment,
  StreamingCursor,
  distributeMediaIntoMarkdown,
} from './message-list';

export {
  ToolCallCard,
  formatToolAction,
  ContextIngestionCard,
  InlineSourceAvatar,
  ImageAttachment,
  FileAttachment,
  StreamingCursor,
  distributeMediaIntoMarkdown,
};

const MemoizedMarkdownBlock: React.FC<{
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  onOpenLightbox?: (url?: string, prompt?: string, engine?: string) => void;
}> = memo(
  ({ content, isStreaming, citations, onOpenLightbox }) => {
    // useSmoothTypewriter drives the RAF-paced reveal — no useDeferredValue on top (double-buffer overhead)
    const smoothContent = useSmoothTypewriter(content, isStreaming || false);

    // Keep a ref so the components object can read the latest citations
    // without being recreated every time citations changes (e.g. every stream chunk).
    const citationsRef = useRef<Citation[] | undefined>(citations);
    useEffect(() => {
      citationsRef.current = citations;
    }, [citations]);

    // ── Content processing ─────────────────────────────────────────────────────
    // During streaming: only run the two cheapest transforms that must be live:
    //   1. Citation badge replacement  (required so [Source N] never appears raw)
    //   2. Dollar sign escaping        (required to prevent KaTeX mid-stream glitch)
    //
    // All heavy O(n) transforms (ref-linkification, URL cleaning, mermaid
    // auto-wrap, heading reflow, table fix) are deferred to post-stream.
    // This eliminates the per-chunk CPU spikes that caused the clunky re-layout.
    const processedContent = useMemo(() => {
      let out = smoothContent;

      // ── Always: Citation badge replacement ────────────────────────────────
      if (citations && citations.length > 0) {
        out = out.replace(
          /\[(?:Source\s*)?(\d+(?:\s*,\s*(?:Source\s*)?\d+)*)\]/gi,
          (_match, group) => {
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
          }
        );
      }
      // Strip leftover unlinked [Source N] brackets that had no matching citation
      out = out.replace(/\s*\[(?:Source\s*)?\d+(?:\s*,\s*(?:Source\s*)?\d+)*\](?!\()/gi, '');

      // ── Always: Escape bare dollar signs to prevent KaTeX math mode glitch ──
      out = out.replace(/\$(\d+(?:,\d{3})*(?:\.\d+)?)/g, '\\$$1');

      // ── Post-stream only: heavy transforms ───────────────────────────────────
      if (!isStreaming) {
        // Convert bare reference list entries into proper markdown links
        out = out
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (/^\[.*?\]\(https?:\/\//.test(trimmed) || /^!\[.*?\]\(https?:\/\//.test(trimmed))
              return line;
            const refMatch = trimmed.match(/^\[(\d+)\](?::\s*|\s+[-—–]?\s*)(https?:\/\/\S+)(.*)$/);
            if (refMatch) {
              const num = refMatch[1];
              const url = refMatch[2].replace(/[).,;]+$/, '');
              const rest = refMatch[3]?.trim();
              let label = '';
              try {
                label = new URL(url).hostname.replace(/^www\./, '');
              } catch {
                label = `Source ${num}`;
              }
              return line.replace(trimmed, `[${label}](${url})${rest ? ` ${rest}` : ''}`);
            }
            const numRefMatch = trimmed.match(
              /^(\d+)\.\s+(?:[^h][^\n]*?\s+)?(https?:\/\/\S+)(.*)$/
            );
            if (numRefMatch) {
              const url = numRefMatch[2].replace(/[).,;]+$/, '');
              let label = '';
              try {
                label = new URL(url).hostname.replace(/^www\./, '');
              } catch {
                label = url;
              }
              return line.replace(url, `[${label}](${url})`);
            }
            const bareUrl = trimmed.match(/^(https?:\/\/\S+)$/);
            if (bareUrl) {
              const url = bareUrl[1].replace(/[).,;]+$/, '');
              let label = '';
              try {
                label = new URL(url).hostname.replace(/^www\./, '');
              } catch {
                label = url;
              }
              return line.replace(trimmed, `[${label}](${url})`);
            }
            return line;
          })
          .join('\n');

        // Clean stray leaked bare image URL fragments (not in markdown image/link syntax)
        out = out
          .split('\n')
          .map((line) => {
            if (/!\[[^\]]*\]\(https?:\/\//.test(line) || /\[[^\]]*\]\(https?:\/\//.test(line))
              return line;
            return line.replace(
              /(?<!\()\bhttps?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?\S*)?\b/gi,
              ''
            );
          })
          .join('\n');

        // Auto-wrap Mermaid flowchart connections
        if (!out.includes('```mermaid')) {
          const MERMAID_LINE_PATTERN =
            /^[ \t]*(?:[A-Za-z0-9_]+(?:\s*\[[^\]]+\]|\s*\([^\)]+\)|\s*\{[^\}]+\})?\s*(?:--\s*(?:"[^"]*"|'[^']*'|\|[^|]+\||[A-Za-z0-9_\s]+)\s*-->|-->|==>|-\.-\>|---\s*\|[^|]+\|\s*-->|--o|--x|--\s*>\s*)\s*[A-Za-z0-9_]+(?:\s*\[[^\]]+\]|\s*\([^\)]+\)|\s*\{[^\}]+\})?|[A-Za-z0-9_]+\s*\[[^\]]+\])[ \t]*$/;
          const lines = out.split('\n');
          const newLines: string[] = [];
          let mermaidBuffer: string[] = [];
          const flushMermaid = () => {
            if (mermaidBuffer.length >= 2) {
              newLines.push('\n```mermaid\nflowchart TD');
              for (const ml of mermaidBuffer) newLines.push(`  ${ml.trim()}`);
              newLines.push('```\n');
            } else if (mermaidBuffer.length > 0) {
              newLines.push(...mermaidBuffer);
            }
            mermaidBuffer = [];
          };
          for (const line of lines) {
            if (MERMAID_LINE_PATTERN.test(line.trim())) {
              mermaidBuffer.push(line);
            } else {
              flushMermaid();
              newLines.push(line);
            }
          }
          flushMermaid();
          out = newLines.join('\n');
        }

        // Ensure headings have surrounding newlines
        out = out.replace(/([^\n])\s*(#{1,6}\s+[^\n]+)/g, '$1\n\n$2\n\n');

        // Fix accidentally-bracketed markdown headings
        out = out.replace(/\[\s*(#{1,6}\s+[^\]]+)\]/g, '$1');
      }

      return out;
    }, [smoothContent, citations, isStreaming]);

    const components = useMemo(
      () => ({
        pre({ children }: any) {
          return children;
        },
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          if (!inline && match) {
            const lang = match[1].toLowerCase();
            const rawCode = String(children).trim();

            // 1. If markdown/text was enclosed in a code fence, render it cleanly as markdown rather than a code block box
            if (['markdown', 'md', 'text', 'txt', 'table'].includes(lang)) {
              return (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                  rehypePlugins={[rehypeRaw, rehypeKatex]}
                  components={components}
                >
                  {rawCode}
                </ReactMarkdown>
              );
            }

            // 2. If diagram or presentation deck, suppress codeblock in chat bubble — handled exclusively by Artifact Canvas & Card
            const isDiagramOrPresentation =
              ['mermaid', 'diagram', 'diagram-design', 'slidev', 'slides'].includes(lang) ||
              ((lang === 'html' || lang === 'svg' || lang === 'xml') &&
                (/<svg\b/i.test(rawCode) ||
                  /class="[^"]*diagram/i.test(rawCode) ||
                  /viewBox=/i.test(rawCode))) ||
              /^\s*(flowchart|graph\s+(?:TD|TB|LR|RL)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|C4Context|C4Container)\b/i.test(
                rawCode
              );

            if (isDiagramOrPresentation) {
              return null;
            }

            // 3. Code block is ONLY rendered when there is real code generation
            return <CodeBlock code={rawCode} language={match[1]} />;
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
        h1: ({ children }: any) => (
          <h1
            className={`text-base md:text-lg font-sans font-semibold tracking-tight text-foreground mt-4 mb-2 pb-1 border-b border-border ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </h1>
        ),
        h2: ({ children }: any) => (
          <h2
            className={`text-sm md:text-base font-sans font-semibold tracking-tight text-foreground mt-3.5 mb-1.5 ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </h2>
        ),
        h3: ({ children }: any) => (
          <h3
            className={`text-xs md:text-sm font-sans font-semibold tracking-tight text-foreground/90 mt-3 mb-1 ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </h3>
        ),
        h4: ({ children }: any) => (
          <h4 className="text-xs font-sans font-semibold tracking-tight text-foreground/80 mt-2.5 mb-1">
            {children}
          </h4>
        ),

        // Use div instead of p to allow block-level children (e.g. ImageAttachment renders a div).
        // Styled identically to a paragraph — avoids the `<div> inside <p>` hydration error.
        p: ({ children }: any) => (
          <div
            className={`text-[13.5px] md:text-[14px] font-sans antialiased leading-[1.6] tracking-[0.01em] text-foreground/90 my-2 ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </div>
        ),
        ul: ({ children }: any) => (
          <ul
            className={`list-disc pl-5 space-y-1 my-2 text-[13.5px] md:text-[14px] font-sans antialiased text-foreground/85 ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </ul>
        ),
        ol: ({ children }: any) => (
          <ol
            className={`list-decimal pl-5 space-y-1 my-2 text-[13.5px] md:text-[14px] font-sans antialiased text-foreground/85 ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </ol>
        ),
        li: ({ children }: any) => <li className="leading-snug pl-0.5">{children}</li>,
        strong: ({ children }: any) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }: any) => <em className="italic text-foreground/90">{children}</em>,
        blockquote: ({ children }: any) => (
          <blockquote
            className={`my-2 py-2 px-3 bg-muted/40 border-l-3 border-primary/80 rounded-r-lg text-xs font-sans text-foreground/90 shadow-xs ${!isStreaming ? 'animate-smooth-reveal' : ''}`}
          >
            {children}
          </blockquote>
        ),
        hr: () => (
          <div className="my-3 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
        ),
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
          if (href && isYouTubeUrl(href)) {
            const videoId = extractYouTubeVideoId(href);
            if (videoId) {
              const rawTitle =
                typeof children === 'string'
                  ? children
                  : Array.isArray(children)
                    ? children.map((c: any) => (typeof c === 'string' ? c : '')).join('')
                    : '';
              const cleanTitle = rawTitle.replace(/^YouTube\s*Video:\s*/i, '').trim();
              return (
                <YouTubePlayerCard videoId={videoId} title={cleanTitle || undefined} url={href} />
              );
            }
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
        thead: ({ children }: any) => (
          <thead className="bg-muted/70 border-b border-border">{children}</thead>
        ),
        th: ({ children }: any) => (
          <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {children}
          </th>
        ),
        td: ({ children }: any) => (
          <td className="px-4 py-2.5 text-foreground/90 border-b border-border/40 hover:bg-muted/20 transition-colors">
            {children}
          </td>
        ),
        // Inline section illustration — rich interactive ImageArtifactCard or YouTubePlayerCard
        img: ({ src, alt }: any) => {
          if (!src) return null;
          if (isYouTubeUrl(src)) {
            const videoId = extractYouTubeVideoId(src);
            if (videoId) {
              return <YouTubePlayerCard videoId={videoId} title={alt || undefined} url={src} />;
            }
          }
          const isExternal = typeof src === 'string' && src.startsWith('https://');
          if (!isExternal) return <ImageAttachment src={src} alt={alt || ''} />;
          return (
            <ImageArtifactCard
              imageUrl={src}
              prompt={alt || 'Visual Reference'}
              engine="Verified Media"
              onOpenLightbox={onOpenLightbox}
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false;
    if (prevProps.isStreaming !== nextProps.isStreaming) return false;
    if ((prevProps.citations?.length || 0) !== (nextProps.citations?.length || 0)) return false;
    return true;
  }
);
MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MarkdownContent: React.FC<{
  content: string;
  blocks?: string[];
  isStreaming?: boolean;
  citations?: Citation[];
  images?: Array<{
    url?: string;
    name?: string;
    engine?: string;
    data?: string;
    mimeType?: string;
    aspectRatio?: string;
  }>;
  videos?: Array<{
    url?: string;
    previewUrl?: string;
    title?: string;
    duration?: number;
    source?: string;
    author?: string;
    authorUrl?: string;
  }>;
  audios?: Array<{
    url?: string;
    title?: string;
    artist?: string;
    duration?: number;
    source?: string;
    tags?: string;
    previewUrl?: string;
  }>;
  onOpenLightbox?: (url?: string, prompt?: string, engine?: string) => void;
}> = memo(
  ({ content, blocks, isStreaming, citations, images, videos, audios, onOpenLightbox }) => {
    // Hide raw XML artifact tags from being rendered in text bubble
    const cleanText = (text: string) => {
      return text.replace(/<nyx_artifact[\s\S]*?(?:<\/nyx_artifact>|$)/g, '');
    };

    const cleanedContent = cleanText(content);

    // During streaming: skip distributeMediaIntoMarkdown to prevent layout jumping
    // as headings arrive incrementally. Apply media distribution only once stream completes.
    const blocksToRender = useMemo(() => {
      if (blocks?.length) {
        const combined = blocks.map((b) => cleanText(b)).join('\n\n');
        if (isStreaming) return [combined];
        return [distributeMediaIntoMarkdown(combined, images, videos, audios)];
      }
      if (isStreaming) return [cleanedContent];
      return [distributeMediaIntoMarkdown(cleanedContent, images, videos, audios)];
    }, [blocks, cleanedContent, images, videos, audios, isStreaming]);

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
  }
);
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
      <div
        className={`mt-3 flex items-center gap-1 focus-within:opacity-100 transition-opacity duration-200 ${isSpeaking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
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

        {!isUser && content && (
          <TtsSpeakerButton isSpeaking={isSpeaking} onToggle={handleTtsToggle} />
        )}

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
        <span>
          {citations.length} source{citations.length !== 1 ? 's' : ''}
        </span>
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
                  <span className="font-medium text-foreground/90 truncate">
                    {cite.title || cite.url}
                  </span>
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
    toast.success('Diagnostics copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const bgClass = isHighDemand
    ? 'border-orange-500/20 bg-orange-500/[0.03] dark:bg-[oklch(0.75_0.18_65/0.05)] shadow-orange-950/5 text-orange-200'
    : 'border-red-500/20 bg-red-500/[0.03] dark:bg-[oklch(0.63_0.22_28.5/0.05)] shadow-red-950/5 text-red-200';

  const badgeClass = isHighDemand
    ? 'bg-orange-500/10 text-orange-300 border-orange-500/20'
    : 'bg-red-500/10 text-red-300 border-red-500/20';

  const iconClass = isHighDemand ? 'text-orange-400 animate-pulse' : 'text-red-400';
  const title = isHighDemand ? 'High Server Load Detected' : 'Execution Engine Alert';

  return (
    <div
      className={`my-3 rounded-xl border p-4 shadow-sm backdrop-blur-md transition-all duration-300 ${bgClass}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg bg-background/50 border border-border/10 shrink-0 ${iconClass}`}
        >
          <AlertTriangle className="w-4 h-4 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-semibold text-[13px] tracking-tight">{title}</h4>
            <span
              className={`text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border ${badgeClass}`}
            >
              {isHighDemand ? '429 Limit' : 'Inference Error'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words max-w-full font-sans">
            {isHighDemand
              ? 'The inference server is currently experiencing extremely high volume. Your request has been queued but rate-limited.'
              : 'An unexpected error occurred during execution. This could be due to a backend crash or configuration misalignment.'}
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
          <span>{showLogs ? 'Hide Diagnostics' : 'Inspect Diagnostics'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${showLogs ? 'rotate-180' : ''}`}
          />
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
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{copied ? 'Copied' : 'Copy Log'}</span>
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
            <span className="text-primary/40 group-hover:text-primary/70 shrink-0 transition-colors duration-150 text-[11px]">
              ↵
            </span>
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
  const webSearchEnabled = useAppStore((state) => state.webSearchEnabled);

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

  const handleOpenLightbox = useCallback((imageUrl?: string, prompt?: string, engine?: string) => {
    if (imageUrl) {
      setLightbox({ isOpen: true, imageUrl, prompt: prompt || '', engine });
    }
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightbox((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Build the display list: history + active stream message (if any)
  const allMessages = useMemo(
    () => (activeStreamMessage ? [...history, activeStreamMessage] : history),
    [history, activeStreamMessage]
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    if (smooth) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  const jumpToBottom = useCallback(() => {
    scrollToBottom(true);
    setAutoScroll(true);
    setShowJumpToBottom(false);
  }, [scrollToBottom]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const distanceFromBottom = target.scrollHeight - target.clientHeight - target.scrollTop;
      const isAtBottom = distanceFromBottom < 80;

      if (isAtBottom) {
        if (!autoScroll) setAutoScroll(true);
        if (showJumpToBottom) setShowJumpToBottom(false);
      } else {
        if (autoScroll) setAutoScroll(false);
        if (!showJumpToBottom && distanceFromBottom > 150) setShowJumpToBottom(true);
      }
    },
    [autoScroll, showJumpToBottom]
  );

  // Smooth auto-scroll following streaming output without fighting user scrolls
  useEffect(() => {
    if (!autoScroll || allMessages.length === 0) return;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [allMessages, autoScroll]);

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
            className="absolute inset-0 overflow-y-auto custom-scrollbar scroll-smooth overscroll-y-contain"
            style={{ overflowAnchor: 'auto' }}
            onScroll={handleScroll}
          >
            <div className="flex flex-col gap-4 py-4 px-3 md:px-4 w-full max-w-3xl mx-auto">
              {allMessages.map((msg, index) => {
                const isLast = index === allMessages.length - 1;
                const isStreaming = isLast && (activeStreamMessage ? true : isLoading);
                const msgKey = msg.timestamp ? `${msg.timestamp}-${index}` : `msg-${index}`;

                return (
                  <div key={msgKey} className="w-full">
                    <MessageBubble
                      msg={msg}
                      previousMsg={index > 0 ? allMessages[index - 1] : undefined}
                      index={index}
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
                );
              })}
              <div ref={bottomRef} className="h-4 w-full shrink-0 pointer-events-none" />
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
