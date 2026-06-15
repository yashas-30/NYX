// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatMessageList.tsx
 * @description Production-grade message list with reasoning display,
 *   tool visualization, branching, and Claude/Kimi-parity UX.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  ArrowDown,
  Terminal,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  RefreshCw,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Wrench,
  FileText,
  Image as ImageIcon,
  X,
  Sparkles,
  Clock,
  AlertTriangle,
  Loader2,
  Square,
  Download,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from '@src/shared/components/ui/sonner';
import { AVAILABLE_MODELS } from '@src/shared/config/models';
import { Logo, NyxLoader, CatLoader, AnimatedLogo } from '@src/assets/icons/icons';
import { ThinkingBlock } from './ThinkingBlock';
import { ArtifactPanel } from './ArtifactPanel';
import { Citation } from './CitationCard';
import { SearchResultsPanel } from './SearchResultsPanel';
import { MemoryPanel } from './MemoryPanel';
import { ArtifactViewer } from '../../../components/artifacts/ArtifactViewer';
import { tts } from '@src/features/voice/tts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Citation is imported from CitationCard — re-export for consumers that import it from here
export type { Citation };

export interface ChatMessageListProps {
  history: ChatMessage[];
  activeAgent: 'nyx';
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
  streamingContent?: string;
  streamingReasoning?: string;
  streamingToolCalls?: ToolCall[];
  activeModel?: string;
  onArtifactClick?: (artifact: any) => void;
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
}

// ---------------------------------------------------------------------------
// Tool Call Visualizer
// ---------------------------------------------------------------------------

const ToolCallCard: React.FC<{
  tool: ToolCall;
  status: 'pending' | 'running' | 'completed' | 'error';
}> = memo(({ tool, status }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = status === 'running';
  const isError = status === 'error';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`my-2 rounded-md border overflow-hidden ${
        isError
          ? 'bg-red-500/5 border-red-500/20'
          : isRunning
            ? 'bg-sky-500/5 border-sky-500/20'
            : 'bg-card border-border'
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
          <Wrench size={13} className="text-emerald-400 shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-foreground/90 truncate">
          {tool.function.name}
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
          {status}
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
            <div className="px-3.5 pb-3 pt-1 border-t border-border">
              <div className="text-[10px] text-muted-foreground font-mono mb-1.5">Arguments:</div>
              <pre className="text-[11px] font-mono text-foreground/90 bg-muted/50 rounded-md p-2.5 overflow-x-auto">
                {JSON.stringify(JSON.parse(tool.function.arguments || '{}'), null, 2)}
              </pre>
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

const ContextIngestionCard: React.FC<{
  tools: { tool: ToolCall; status: string }[];
}> = memo(({ tools }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tools.some(t => t.status === 'running');
  const isError = tools.some(t => t.status === 'error');

  if (tools.length === 0) return null;

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
          Read {tools.length} document{tools.length !== 1 ? 's' : ''}
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
          {isRunning ? 'Reading...' : isError ? 'Error' : 'Analyzed'}
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
              {tools.map((t, i) => (
                <div key={i} className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded px-2 py-1 flex justify-between items-center">
                  <span className="truncate">{t.tool.function.name}</span>
                  <span className="text-[9px] text-muted-foreground/50 shrink-0">{t.status}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
ContextIngestionCard.displayName = 'ContextIngestionCard';

// ---------------------------------------------------------------------------
// Code Block with Syntax Highlighting
// ---------------------------------------------------------------------------

const CodeBlock: React.FC<{ language: string; code: string }> = memo(({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const lang = language || 'text';

  return (
    <div className="relative group/code my-4 rounded-md border border-border bg-muted overflow-hidden text-left">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal size={11} className="text-[#58a6ff]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {lang}
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border transition-all cursor-pointer"
        >
          {copied ? (
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
        </motion.button>
      </div>

      {/* Syntax Highlighted Code */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={lang === 'text' ? 'plaintext' : lang}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '1.25rem',
            background: 'transparent',
            fontSize: '12px',
            lineHeight: 1.6,
          }}
          showLineNumbers
          lineNumberStyle={{
            color: '#484f58',
            fontSize: '11px',
            paddingRight: '1rem',
            minWidth: '2.5rem',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

// ---------------------------------------------------------------------------
// Image Attachment Display
// ---------------------------------------------------------------------------

const ImageAttachment: React.FC<{ src: string; alt?: string }> = memo(({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="my-2 relative group/image"
    >
      <div
        className={`relative rounded-md overflow-hidden border border-border bg-muted/50 cursor-zoom-in transition-all ${
          expanded
            ? 'fixed inset-4 z-50 flex items-center justify-center bg-black/80'
            : 'inline-block max-w-sm'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {!loaded && (
          <div className="w-32 h-32 flex items-center justify-center">
            <ImageIcon size={20} className="text-muted-foreground/50 animate-pulse" />
          </div>
        )}
        <img
          src={
            src.startsWith('/uploads/') || src.startsWith('/api/')
              ? `${(window as any).__NYX_BACKEND_URL__ || ''}${src}`
              : src
          }
          alt={alt || 'Attached image'}
          className={`max-h-64 object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
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

const FileAttachment: React.FC<{ name: string; size?: number; type?: string; mimeType?: string }> = memo(({ name, size, type, mimeType }) => {
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
// Streaming Cursor
// ---------------------------------------------------------------------------

const StreamingCursor: React.FC = memo(() => (
  <span className="inline-flex items-center ml-1">
    <span className="w-[7px] h-[14px] bg-primary/60 rounded-sm animate-pulse" />
  </span>
));
StreamingCursor.displayName = 'StreamingCursor';

// ---------------------------------------------------------------------------
// Markdown Renderer
// ---------------------------------------------------------------------------
import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';

const MarkdownContent: React.FC<{
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
}> = memo(({ content, isStreaming, citations }) => {
  const smoothContent = useSmoothTypewriter(content, isStreaming || false);
  const deferredContent = React.useDeferredValue(smoothContent);
  
  let processedContent = deferredContent;
  if (citations && citations.length > 0) {
    processedContent = smoothContent.replace(/\[(\d+)\]/g, (match, id) => {
      const cite = citations.find((c) => c.id === id);
      if (cite) {
        return `[${match}](#cite-${id})`;
      }
      return match;
    });
  }

  const components = useMemo(
    () => ({
      code({ className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const code = String(children).replace(/\n$/, '');

        if (match || code.includes('\n')) {
          return <CodeBlock language={match?.[1] || 'text'} code={code} />;
        }

        return (
          <code
            className="px-1.5 py-0.5 rounded-md bg-muted border border-border text-primary text-[11px] font-mono font-semibold"
            {...props}
          >
            {children}
          </code>
        );
      },
      h1: ({ children }: any) => (
        <h1 className="text-lg font-serif font-medium tracking-tight text-foreground mt-6 mb-3 pb-2 border-b border-border animate-smooth-reveal">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-[16px] font-serif font-medium tracking-tight text-foreground mt-5 mb-3 animate-smooth-reveal">
          {children}
        </h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-[15px] font-serif font-medium tracking-tight text-foreground/90 mt-4 mb-2 animate-smooth-reveal">
          {children}
        </h3>
      ),
      p: ({ children }: any) => (
        <p className="text-[15px] md:text-[16px] font-sans antialiased leading-[1.85] tracking-[0.015em] text-foreground/90 my-3 animate-smooth-reveal">{children}</p>
      ),
      ul: ({ children }: any) => (
        <ul className="list-disc pl-6 space-y-2 my-4 text-[15px] md:text-[16px] font-sans antialiased text-foreground/85 animate-smooth-reveal">{children}</ul>
      ),
      ol: ({ children }: any) => (
        <ol className="list-decimal pl-6 space-y-2 my-4 text-[15px] md:text-[16px] font-sans antialiased text-foreground/85 animate-smooth-reveal">{children}</ol>
      ),
      li: ({ children }: any) => <li className="leading-relaxed pl-1">{children}</li>,
      strong: ({ children }: any) => (
        <strong className="font-bold text-foreground">{children}</strong>
      ),
      em: ({ children }: any) => <em className="italic text-foreground/90">{children}</em>,
      blockquote: ({ children }: any) => (
        <blockquote className="my-2 pl-4 py-1 border-l-2 border-border bg-transparent text-sm text-muted-foreground italic">
          {children}
        </blockquote>
      ),
      hr: () => <div className="my-4 h-px w-full bg-border" />,
      a: ({ href, children }: any) => {
        if (href?.startsWith('#cite-')) {
          const id = href.replace('#cite-', '');
          const cite = citations?.find((c) => c.id === id);
          return (
            <a
              href={cite?.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              title={cite?.title || cite?.url}
              className="inline-flex items-center justify-center min-w-[16px] h-4 ml-0.5 px-1 text-[9px] font-bold text-primary bg-primary/10 rounded-md hover:bg-primary/20 hover:scale-110 transition-all align-super no-underline cursor-pointer"
              onClick={(e) => {
                if (!cite?.url) e.preventDefault();
              }}
            >
              {id}
            </a>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-semibold hover:underline underline-offset-4 decoration-border"
          >
            {children}
          </a>
        );
      },
      table: ({ children }: any) => (
        <div className="my-3 overflow-x-auto">
          <table className="w-full text-sm border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }: any) => <thead className="bg-muted/50">{children}</thead>,
      th: ({ children }: any) => (
        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          {children}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="px-3 py-2 text-foreground/80 border-b border-border">{children}</td>
      ),
    }),
    []
  );

  return (
    <div className="prose-nyx w-full">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {processedContent}
      </ReactMarkdown>
      {isStreaming && <StreamingCursor />}
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

// ---------------------------------------------------------------------------
// TTS Speaker Button
// ---------------------------------------------------------------------------

const TtsSpeakerButton: React.FC<{
  isSpeaking: boolean;
  onToggle: () => void;
}> = memo(({ isSpeaking, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      title={isSpeaking ? 'Stop reading' : 'Read aloud'}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer uppercase font-bold tracking-wider"
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

const MessageActions: React.FC<{
  index: number;
  content: string;
  onEdit?: (index: number, content: string) => void;
  onRegenerate?: (index: number) => void;
  onBranch?: (index: number) => void;
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
    onEdit,
    onRegenerate,
    onBranch,
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
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer uppercase font-bold tracking-wider"
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
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer uppercase font-bold tracking-wider"
          >
            <Pencil size={10} />
            <span>Edit</span>
          </button>
        )}

        {!isUser && onRegenerate && (
          <button
            onClick={() => onRegenerate(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer uppercase font-bold tracking-wider"
            title={`Regenerate with ${activeModel || 'current model'}`}
          >
            <RefreshCw size={10} />
            <span>Regenerate</span>
          </button>
        )}

        {!isUser && onBranch && (
          <button
            onClick={() => onBranch(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer uppercase font-bold tracking-wider"
          >
            <GitBranch size={10} />
            <span>Branch</span>
          </button>
        )}

        {!isUser && content && <TtsSpeakerButton isSpeaking={isSpeaking} onToggle={handleTtsToggle} />}
      </div>
    );
  }
);
MessageActions.displayName = 'MessageActions';

// ---------------------------------------------------------------------------
// Feedback Buttons
// ---------------------------------------------------------------------------

const FeedbackButtons: React.FC<{
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
// Message Bubble
// ---------------------------------------------------------------------------

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
  }) => {
    const isUser = msg.role === 'user';
    const [isExpanded, setIsExpanded] = useState(false);
    const msgId = `${msg.timestamp}-${index}`;
    // Show "Thinking..." spinner ONLY when streaming has started but no content or reasoning yet
    const isThinking =
      isStreaming && !msg.content && !msg.reasoning &&
      (!msg.toolCalls || msg.toolCalls.length === 0) &&
      (msg.status === 'loading' || msg.status === undefined);
      
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
          <div className="max-w-[85%] sm:max-w-[75%]">
            <div className="py-3.5 px-5 bg-muted/10 border border-border rounded-2xl hover:bg-muted/20 transition-all shadow-sm">
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
                    <div className="text-[14px] font-normal leading-relaxed text-foreground select-text whitespace-pre-wrap">
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
            />
          </div>
        ) : (
          <div className="flex flex-col w-full animate-fade-in relative">
            {/* Clean Header with Message-Specific Model Resolution */}
            {(() => {
              const messageModel = msg.model || activeModel;
              if (!messageModel || messageModel.toLowerCase() === 'default') return null;
              const found = AVAILABLE_MODELS.find((m) => m.id === messageModel);
              const displayName = found ? found.name : messageModel;
              if (displayName.toLowerCase() === 'default') return null;

              if (
                !(msg.content ||
                  msg.reasoning ||
                  (msg.toolCalls && msg.toolCalls.length > 0) ||
                  msg.status === 'loading')
              ) {
                return null;
              }

              return (
                <div className="flex items-baseline gap-2 mb-1 select-none pl-[92px] md:pl-0">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    {displayName}
                  </span>
                </div>
              );
            })()}

            <div className="flex w-full gap-3 md:gap-0 items-start relative">
              <div className="md:absolute md:-left-[92px] md:top-0 flex-shrink-0 -mt-3 select-none">
                <div className="w-20 h-20 flex items-center justify-center hover:scale-105 transition-all duration-300 overflow-hidden">
                  {isLoadingIcon ? (
                    <NyxLoader size={36} className="text-foreground animate-spin" />
                  ) : (
                    <AnimatedLogo size={80} className="animate-fade-in" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {/* Error state */}
                {msg.status === 'error' && (
                  (() => {
                    const isHighDemand = msg.content && (msg.content.includes('[UNAVAILABLE]') || msg.content.toLowerCase().includes('high demand') || msg.content.includes('429'));
                    if (isHighDemand) {
                      return (
                        <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-orange-500/5 border border-orange-500/10">
                          <AlertTriangle size={14} className="text-orange-400 shrink-0" />
                          <p className="text-sm text-orange-400/90 font-medium">
                            Server is in high demand. Please retry in a few minutes.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-red-500/5 border border-red-500/10">
                        <AlertTriangle size={14} className="text-red-400 shrink-0" />
                        <p className="text-sm text-red-400/90 font-medium">
                          Error: Generation failed. Please check your model settings or connection.
                        </p>
                      </div>
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
                {isThinking && !msg.reasoning && (
                  <div className="flex items-center gap-2.5 py-1 select-none h-14">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.15em] animate-pulse">
                      Starting reasoning...
                    </span>
                  </div>
                )}

                {/* Content rendering */}
                {(msg.content || (msg.toolCalls && msg.toolCalls.length > 0) || msg.reasoning) && (
                  <div className="pl-0">
                    {/* Reasoning block */}
                    {msg.reasoning && (
                      <ThinkingBlock 
                        content={msg.reasoning} 
                        isComplete={
                          (!isStreaming && msg.status !== 'loading') || 
                          (!!msg.content && msg.content.length > 0) || 
                          (!!msg.toolCalls && msg.toolCalls.length > 0)
                        } 
                      />
                    )}

                    {/* Tool calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        {(() => {
                          const retrievalNames = ['search', 'read', 'memory', 'query', 'retrieve'];
                          const isRetrieval = (name: string) => retrievalNames.some(rn => name.toLowerCase().includes(rn));
                          
                          const retrievalTools = msg.toolCalls!.map((tool, i) => ({
                            tool,
                            status: tool.status || (isStreaming && isLast && i === msg.toolCalls!.length - 1 ? 'running' : 'completed'),
                            index: i
                          })).filter(t => isRetrieval(t.tool.function.name));

                          const otherTools = msg.toolCalls!.map((tool, i) => ({
                            tool,
                            status: tool.status || (isStreaming && isLast && i === msg.toolCalls!.length - 1 ? 'running' : 'completed'),
                            index: i
                          })).filter(t => !isRetrieval(t.tool.function.name));

                          return (
                            <>
                              {retrievalTools.length > 0 && <ContextIngestionCard tools={retrievalTools} />}
                              {otherTools.map(t => (
                                <ToolCallCard
                                  key={t.tool.id || t.index}
                                  tool={t.tool}
                                  status={t.status as any}
                                />
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Main content */}
                    {msg.content && !(msg.status === 'error' && (msg.content.includes('[UNAVAILABLE]') || msg.content.toLowerCase().includes('high demand') || msg.content.includes('429'))) && (
                      <MarkdownContent
                        content={msg.content}
                        isStreaming={isStreaming && isLast}
                        citations={msg.citations}
                      />
                    )}

                    {/* Artifacts */}
                    {(() => {
                      const completeArtifacts = msg.artifacts || [];
                      let streamingArtifacts: any[] = [];
                      if (isStreaming && isLast && msg.content) {
                        const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
                        let match;
                        while ((match = codeBlockRegex.exec(msg.content)) !== null) {
                          const isClosed = msg.content.substring(match.index).includes('```', match[1].length + 3);
                          if (!isClosed) {
                            const lang = match[1]?.toLowerCase();
                            const isArtifactLang = ['html', 'htm', 'react', 'tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript', 'python', 'json', 'csv', 'mermaid', 'svg', 'markdown', 'md'].includes(lang);
                            if (isArtifactLang) {
                              streamingArtifacts.push({ id: 'streaming-artifact', type: 'code', title: 'Generating...', content: '' });
                            }
                          }
                        }
                      }
                      
                      const allArtifacts = [...completeArtifacts, ...streamingArtifacts];
                      if (allArtifacts.length === 0) return null;
                      
                      return (
                        <div className="space-y-1 mt-2">
                          {allArtifacts.map((artifact, i) => {
                            const isArtifactStreaming = artifact.id === 'streaming-artifact';

                            if (isArtifactStreaming) {
                              return (
                                <div key={`streaming-${i}`} className="rounded-md border border-border bg-surface overflow-hidden flex flex-col my-4 shadow-sm w-full max-w-4xl p-4 cursor-default">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                      <NyxLoader size={16} className="text-primary/70 animate-pulse" />
                                    </div>
                                    <div className="flex flex-col gap-1.5 flex-1">
                                      <div className="h-4 bg-muted/60 animate-pulse rounded w-1/3" />
                                      <div className="h-3 bg-muted/60 animate-pulse rounded w-1/4" />
                                    </div>
                                    <div className="text-xs text-primary/70 font-semibold animate-pulse uppercase tracking-wider">
                                      Generating Artifact...
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div 
                                key={artifact.id || i}
                                onClick={() => onArtifactClick?.(artifact)}
                                className="cursor-pointer group flex items-center justify-between p-3.5 my-3 rounded-xl border border-border/60 bg-surface hover:bg-muted/30 hover:border-primary/40 hover:shadow-sm transition-all max-w-4xl"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary">
                                    {artifact.type === 'html' || artifact.type === 'react' || artifact.type === 'code' ? (
                                      <Terminal className="w-4.5 h-4.5" />
                                    ) : (
                                      <FileText className="w-4.5 h-4.5" />
                                    )}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-semibold text-foreground truncate">
                                      {artifact.title || 'Generated Artifact'}
                                    </span>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                      {artifact.type === 'code' ? artifact.language || 'code' : artifact.type}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                  Click to open
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Citations — rendered via SearchResultsPanel */}
                    {msg.citations && msg.citations.length > 0 && (
                      <SearchResultsPanel
                        citations={msg.citations.map((cite, i) => ({
                          id: cite.id ?? String(i),
                          index: i + 1,
                          title: cite.title || cite.source || '',
                          url: cite.url || '',
                          snippet: cite.snippet || cite.quote || '',
                        }))}
                      />
                    )}

                    {/* Actions */}
                    {!isStreaming && (
                      <>
                        <MessageActions
                          index={index}
                          content={msg.content || ''}
                          onCopy={onCopy}
                          copiedId={copiedId}
                          msgId={msgId}
                          isUser={false}
                          onRegenerate={onRegenerate}
                          onBranch={onBranch}
                          activeModel={activeModel}
                          siblingCount={msg.siblingCount}
                          currentIndex={msg.currentIndex}
                        />
                        <FeedbackButtons msg={msg} submitReward={submitReward} />
                      </>
                    )}
                  </div>
                )}

                {/* Empty fallback */}
                {!msg.content &&
                  !msg.reasoning &&
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
  }
);
MessageBubble.displayName = 'MessageBubble';

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

const EmptyState: React.FC<{
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
}> = memo(({ suggestedPrompts, onSuggestedPromptClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, ease: 'easeOut' }}
    className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6 gap-6 relative overflow-hidden"
  >
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-primary/[0.02] rounded-md blur-[90px] pointer-events-none select-none -z-10 animate-pulse" />

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.6 }}
      className="relative cursor-default flex items-center justify-center"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative flex items-center justify-center transform-gpu"
      >
        <div className="absolute w-24 h-24 bg-primary/[0.08] rounded-md blur-[45px] pointer-events-none select-none transform-gpu" />
        <Logo
          size={90}
          className="relative z-10 hover:scale-105 transition-transform duration-300 transform-gpu cursor-default"
        />
      </motion.div>
    </motion.div>

    <div className="space-y-2 max-w-sm">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-[20px] font-black tracking-tight text-foreground/80 leading-tight"
      >
        Chat with{' '}
        <span className="font-black text-foreground">
          NY<span className="text-primary">X</span>
        </span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-[10px] uppercase tracking-[0.25em] font-black text-muted-foreground/45 leading-relaxed"
      >
        Conversational assistant page
      </motion.p>
    </div>

    {suggestedPrompts && suggestedPrompts.length > 0 && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full mt-4"
      >
        {suggestedPrompts.slice(0, 4).map((p, idx) => (
          <motion.button
            key={idx}
            whileHover={{
              scale: 1.01,
              backgroundColor: 'var(--muted)',
              borderColor: 'var(--border)',
            }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSuggestedPromptClick?.(p)}
            className="p-4 text-[11px] font-bold text-left rounded-md bg-card border border-border text-foreground/75 hover:text-primary transition-all duration-200 cursor-pointer flex items-center justify-between shadow-sm"
          >
            <span>{p}</span>
            <span className="text-[10px] text-primary/70 font-extrabold ml-2">➔</span>
          </motion.button>
        ))}
      </motion.div>
    )}
  </motion.div>
));
EmptyState.displayName = 'EmptyState';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  history,
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
  streamingContent,
  streamingReasoning,
  streamingToolCalls,
  activeModel,
  onArtifactClick,
  onBranchChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const lastHistoryLength = useRef(history.length);
  const isNearBottom = useRef(true);

  // Virtualizer with dynamic sizing
  const rowVirtualizer = useVirtualizer({
    count: history.length,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => 200, []),
    overscan: 3,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: useCallback(
      (index: number) => {
        const msg = history[index];
        // Use a stable key that doesn't change when content length changes
        // to prevent React from unmounting and resetting useSmoothTypewriter state
        return msg ? `${msg.timestamp}-${index}` : index;
      },
      [history]
    ),
  });

  const lastScrollTop = useRef(0);

  // Smart scroll: auto-scroll only if user was near bottom
  useEffect(() => {
    if (history.length > lastHistoryLength.current) {
      // New message added
      if (isNearBottom.current) {
        requestAnimationFrame(() => {
          rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
        });
      }
    } else if (isLoading) {
      // Streaming content update
      if (isNearBottom.current && autoScroll) {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            // Using a slightly smoother scroll approach for streaming
            // We only force scroll if we are actively tracking the bottom
            const el = containerRef.current;
            el.scrollTop = el.scrollHeight;
          }
        });
      }
    }
    lastHistoryLength.current = history.length;
  }, [history, isLoading, autoScroll, rowVirtualizer, streamingContent, streamingReasoning, streamingToolCalls]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    
    const isScrollingUp = scrollTop < lastScrollTop.current;
    lastScrollTop.current = scrollTop;
    
    // 10px threshold is enough to allow for subpixel rendering differences
    const distanceToBottom = Math.ceil(scrollHeight - scrollTop - clientHeight);
    const isAtBottom = distanceToBottom <= 10;
    
    // Only turn off autoScroll if the user explicitly scrolled UP away from the bottom
    // This prevents content growth from randomly disabling auto-scroll
    if (isScrollingUp && !isAtBottom) {
      setAutoScroll(false);
      setShowJumpToBottom(true);
      isNearBottom.current = false;
    } else if (isAtBottom) {
      setAutoScroll(true);
      setShowJumpToBottom(false);
      isNearBottom.current = true;
    }
  }, []);

  const jumpToBottom = useCallback(() => {
    if (history.length > 0) {
      rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
      setAutoScroll(true);
      isNearBottom.current = true;
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        lastScrollTop.current = containerRef.current.scrollTop;
      }
    }
  }, [history.length, rowVirtualizer]);

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

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden bg-background">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative px-0 md:px-24"
        aria-live="polite"
        aria-atomic="false"
      >
        {history.length === 0 ? (
          isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[65vh] gap-4">
              <NyxLoader size={20} className="text-zinc-500" />
              <span className="text-xs text-zinc-500 tracking-widest uppercase font-semibold">
                Initializing...
              </span>
            </div>
          ) : (
            <EmptyState
              suggestedPrompts={suggestedPrompts}
              onSuggestedPromptClick={onSuggestedPromptClick}
            />
          )
        ) : (
          <div
            className="w-full max-w-3xl mx-auto px-4 md:px-0 pb-6 pt-4 relative"
            style={{ height: `${totalSize}px` }}
          >
            {virtualItems.map((virtualItem) => {
              const msg = history[virtualItem.index];
              if (!msg) return null;

              const isLast = virtualItem.index === history.length - 1;
              const isStreaming = isLast && isLoading;

              // Merge streaming state into last message
              const displayMsg = isStreaming
                ? {
                    ...msg,
                    content: streamingContent || msg.content,
                    reasoning: streamingReasoning || msg.reasoning,
                    toolCalls: streamingToolCalls || msg.toolCalls,
                  }
                : msg;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 w-full px-4"
                  style={{
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="py-3">
                    <MessageBubble
                      msg={displayMsg}
                      index={virtualItem.index}
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
                    />
                  </div>
                </div>
              );
            })}
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
            className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3.5 py-2.5 rounded-md bg-card/90 border border-border text-foreground/70 hover:text-foreground shadow-sm border border-border text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-all hover:bg-muted/90 cursor-pointer"
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
    </div>
  );
};
