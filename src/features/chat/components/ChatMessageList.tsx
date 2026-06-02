/**
 * @file src/features/chat/components/ChatMessageList.tsx
 * @description Production-grade message list with reasoning display,
 *   tool visualization, branching, and Claude/Kimi-parity UX.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Search,
  FileText,
  Image as ImageIcon,
  X,
  Sparkles,
  Clock,
  AlertTriangle,
  Loader2,
  Globe,
  Square,
  Download,
} from 'lucide-react';
import { ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from '@src/shared/components/ui/sonner';
import { Logo, NyxLoader } from '@src/assets/icons/icons';
import { ThinkingBlock } from './ThinkingBlock';
import { ArtifactPanel } from './ArtifactPanel';
import { CitationCard } from './CitationCard';
import { SearchResultsPanel } from './SearchResultsPanel';
import { MemoryPanel } from './MemoryPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Citation {
  id?: string;
  source?: string;
  quote?: string;
  url?: string;
  title?: string;
  snippet?: string;
}

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
  streamingContent?: string;
  streamingReasoning?: string;
  streamingToolCalls?: ToolCall[];
  activeModel?: string;
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
      className={`my-2 rounded-xl border overflow-hidden ${
        isError
          ? 'bg-red-500/5 border-red-500/20'
          : isRunning
            ? 'bg-sky-500/5 border-sky-500/20'
            : 'bg-white/[0.02] border-white/5'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
      >
        {isRunning ? (
          <Loader2 size={13} className="text-sky-400 animate-spin shrink-0" />
        ) : isError ? (
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
        ) : (
          <Wrench size={13} className="text-emerald-400 shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-zinc-300 truncate">
          {tool.function.name}
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ml-auto shrink-0 ${
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
          <ChevronDown size={12} className="text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-zinc-500 shrink-0" />
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
            <div className="px-3.5 pb-3 pt-1 border-t border-white/5">
              <div className="text-[10px] text-zinc-500 font-mono mb-1.5">Arguments:</div>
              <pre className="text-[11px] font-mono text-zinc-300 bg-black/20 rounded-lg p-2.5 overflow-x-auto">
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
    <div className="relative group/code my-4 rounded-2xl border border-white/[0.04] bg-[#0d1117] overflow-hidden shadow-xl text-left">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Terminal size={11} className="text-[#58a6ff]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {lang}
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/5 text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all cursor-pointer"
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="my-2 relative group/image"
    >
      <div
        className={`relative rounded-xl overflow-hidden border border-white/5 bg-zinc-900/50 cursor-zoom-in transition-all ${
          expanded
            ? 'fixed inset-4 z-50 flex items-center justify-center bg-black/80'
            : 'inline-block max-w-sm'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {!loaded && (
          <div className="w-32 h-32 flex items-center justify-center">
            <ImageIcon size={20} className="text-zinc-600 animate-pulse" />
          </div>
        )}
        <img
          src={src}
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
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
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
// Streaming Cursor
// ---------------------------------------------------------------------------

const StreamingCursor: React.FC = memo(() => (
  <span className="inline-flex items-center ml-1">
    <span className="w-[7px] h-[14px] bg-[#FF3366]/60 rounded-sm animate-pulse" />
  </span>
));
StreamingCursor.displayName = 'StreamingCursor';

// ---------------------------------------------------------------------------
// Markdown Renderer
// ---------------------------------------------------------------------------

const MarkdownContent: React.FC<{
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
}> = memo(({ content, isStreaming, citations }) => {
  let processedContent = content;
  if (citations && citations.length > 0) {
    processedContent = content.replace(/\[(\d+)\]/g, (match, id) => {
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
            className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[#FF3366] text-[11px] font-mono font-semibold"
            {...props}
          >
            {children}
          </code>
        );
      },
      h1: ({ children }: any) => (
        <h1 className="text-base font-black tracking-tight text-foreground mt-5 mb-2 pb-2 border-b border-white/10">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-[13px] font-black tracking-tight text-foreground mt-4 mb-2 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-[#FF3366] inline-block shrink-0" />
          {children}
        </h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-[12px] font-bold tracking-tight text-foreground/90 mt-3 mb-1.5">
          {children}
        </h3>
      ),
      p: ({ children }: any) => (
        <p className="text-sm leading-[1.8] text-foreground/80 my-1.5">{children}</p>
      ),
      ul: ({ children }: any) => (
        <ul className="list-disc pl-6 space-y-1 my-2 text-sm text-foreground/75">{children}</ul>
      ),
      ol: ({ children }: any) => (
        <ol className="list-decimal pl-6 space-y-1 my-2 text-sm text-foreground/75">{children}</ol>
      ),
      li: ({ children }: any) => <li className="leading-relaxed pl-1">{children}</li>,
      strong: ({ children }: any) => (
        <strong className="font-bold text-foreground">{children}</strong>
      ),
      em: ({ children }: any) => <em className="italic text-[#FF3366]/80">{children}</em>,
      blockquote: ({ children }: any) => (
        <blockquote className="my-2 pl-3 py-1 border-l-2 border-[#FF3366]/45 bg-white/[0.01] rounded-r-lg text-sm text-foreground/65 italic">
          {children}
        </blockquote>
      ),
      hr: () => (
        <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      ),
      a: ({ href, children }: any) => {
        if (href?.startsWith('#cite-')) {
          const id = href.replace('#cite-', '');
          const cite = citations?.find((c) => c.id === id);
          return (
            <a
              href={cite?.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              title={cite?.source || cite?.url}
              className="inline-flex items-center justify-center min-w-[16px] h-4 ml-0.5 px-1 text-[9px] font-bold text-[#FF3366] bg-[#FF3366]/10 rounded-full hover:bg-[#FF3366]/20 hover:scale-110 transition-all align-super no-underline cursor-pointer"
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
            className="text-[#FF3366] hover:underline underline-offset-2 decoration-[#FF3366]/30"
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
      thead: ({ children }: any) => <thead className="bg-white/[0.02]">{children}</thead>,
      th: ({ children }: any) => (
        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-zinc-400 border-b border-white/10">
          {children}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="px-3 py-2 text-zinc-300 border-b border-white/[0.04]">{children}</td>
      ),
    }),
    []
  );

  return (
    <div className="prose-nyx w-full">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
      {isStreaming && <StreamingCursor />}
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

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
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(content);
    const editRef = useRef<HTMLTextAreaElement>(null);

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
            className="w-full min-h-[80px] bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-foreground/90 resize-y focus:outline-none focus:border-[#FF3366]/30"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleEditSubmit}
              className="px-3 py-1.5 rounded-lg bg-[#FF3366]/10 border border-[#FF3366]/20 text-[#FF3366] text-[11px] font-semibold hover:bg-[#FF3366]/20 transition-colors cursor-pointer"
            >
              Save & Submit
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-zinc-400 text-[11px] font-semibold hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onCopy(content, msgId)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-zinc-500 hover:text-[#FF3366] hover:bg-white/[0.03] transition-all cursor-pointer uppercase font-bold tracking-wider"
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
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-zinc-500 hover:text-[#FF3366] hover:bg-white/[0.03] transition-all cursor-pointer uppercase font-bold tracking-wider"
          >
            <Pencil size={10} />
            <span>Edit</span>
          </button>
        )}

        {!isUser && onRegenerate && (
          <button
            onClick={() => onRegenerate(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-zinc-500 hover:text-[#FF3366] hover:bg-white/[0.03] transition-all cursor-pointer uppercase font-bold tracking-wider"
            title={`Regenerate with ${activeModel || 'current model'}`}
          >
            <RefreshCw size={10} />
            <span>Regenerate</span>
          </button>
        )}

        {!isUser && onBranch && (
          <button
            onClick={() => onBranch(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-zinc-500 hover:text-[#FF3366] hover:bg-white/[0.03] transition-all cursor-pointer uppercase font-bold tracking-wider"
          >
            <GitBranch size={10} />
            <span>Branch</span>
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
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
      <span className="text-[8.5px] text-zinc-600 font-bold uppercase tracking-wider select-none">
        Helpful?
      </span>
      <button
        onClick={() => handleReward(1)}
        disabled={reward !== undefined}
        className={`p-1 rounded transition-colors cursor-pointer ${
          reward === 1 ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'
        } ${reward !== undefined ? 'opacity-50 cursor-default' : ''}`}
      >
        <ThumbsUp size={11} />
      </button>
      <button
        onClick={() => handleReward(0)}
        disabled={reward !== undefined}
        className={`p-1 rounded transition-colors cursor-pointer ${
          reward === 0 ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'
        } ${reward !== undefined ? 'opacity-50 cursor-default' : ''}`}
      >
        <ThumbsDown size={11} />
      </button>
    </div>
  );
});
FeedbackButtons.displayName = 'FeedbackButtons';

// ---------------------------------------------------------------------------
// Artifact Card
// ---------------------------------------------------------------------------

const ArtifactCard: React.FC<{ artifact: any }> = memo(({ artifact }) => {
  const [expanded, setExpanded] = useState(false);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.title || `artifact.${artifact.language || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-xl border border-[#FF3366]/20 bg-[#FF3366]/[0.02] overflow-hidden"
    >
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer hover:bg-[#FF3366]/[0.05] transition-colors"
      >
        <FileText size={13} className="text-[#FF3366] shrink-0" />
        <span className="text-[11px] font-semibold text-[#FF3366]/90 truncate flex-1">
          {artifact.title || 'Generated Artifact'}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ml-auto shrink-0 bg-[#FF3366]/10 text-[#FF3366]">
          {artifact.type || 'code'}
        </span>
        <button
          onClick={handleDownload}
          className="p-1.5 hover:bg-[#FF3366]/20 rounded-md transition-colors ml-1"
          title="Download Artifact"
        >
          <Download size={12} className="text-[#FF3366]" />
        </button>
        {expanded ? (
          <ChevronDown size={12} className="text-zinc-500 shrink-0 ml-1" />
        ) : (
          <ChevronRight size={12} className="text-zinc-500 shrink-0 ml-1" />
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#FF3366]/10 bg-black/40">
              {artifact.type === 'code' ? (
                <CodeBlock language={artifact.language} code={artifact.content} />
              ) : (
                <div className="p-4 text-[12px] text-zinc-300 whitespace-pre-wrap font-mono">
                  {artifact.content}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
ArtifactCard.displayName = 'ArtifactCard';

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
    activeModel,
  }) => {
    const isUser = msg.role === 'user';
    const msgId = `${msg.timestamp}-${index}`;

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}
      >
        {isUser ? (
          <div className="max-w-[85%] sm:max-w-[75%]">
            <div className="py-3.5 px-5 bg-zinc-900/40 border border-white/[0.04] rounded-2xl shadow-sm hover:border-white/[0.08] transition-all">
              <div className="text-[14px] font-normal leading-relaxed text-zinc-200 select-text whitespace-pre-wrap">
                {msg.content}
              </div>
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {msg.images.map((img, i) => (
                    <ImageAttachment key={i} src={img.url || img.data || ''} alt={img.name} />
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
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            {/* Clean Gemini-style Header */}
            {(msg.content ||
              msg.reasoning ||
              (msg.toolCalls && msg.toolCalls.length > 0) ||
              msg.status === 'loading') && (
              <div className="flex items-center gap-2.5 mb-3 select-none">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#22d3ee]/20 to-[#FF3366]/20 border border-white/10 flex items-center justify-center shadow-inner">
                  <Logo size={14} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-mono font-bold tracking-widest text-[#22d3ee] uppercase">
                    NYX
                  </span>
                  {activeModel && (
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                      {activeModel}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Error state */}
            {msg.status === 'error' && (
              <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-red-500/5 border border-red-500/10">
                <AlertTriangle size={14} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-400/90 font-medium">
                  Error: Generation failed. Please check your model settings or connection.
                </p>
              </div>
            )}

            {/* Stopped state */}
            {msg.status === 'stopped' && (
              <p className="text-sm text-zinc-500 py-1 italic flex items-center gap-2">
                <Square size={10} className="text-zinc-600" />
                Generation stopped by user.
              </p>
            )}

            {/* Loading with no content */}
            {msg.status === 'loading' &&
              !msg.content &&
              !msg.reasoning &&
              (!msg.toolCalls || msg.toolCalls.length === 0) && (
                <div className="flex items-center gap-2.5 py-1 select-none">
                  <NyxLoader size={14} className="text-[#22d3ee] shrink-0" />
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">
                    Formulating response...
                  </span>
                </div>
              )}

            {/* Content rendering */}
            {(msg.content || msg.reasoning || (msg.toolCalls && msg.toolCalls.length > 0)) && (
              <div className="pl-0 sm:pl-8">
                {/* Reasoning Block */}
                {msg.reasoning && (
                  <ThinkingBlock content={msg.reasoning} isComplete={!isStreaming} />
                )}

                {/* Tool calls */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1">
                    {msg.toolCalls.map((tool, i) => (
                      <ToolCallCard
                        key={tool.id || i}
                        tool={tool}
                        status={
                          isStreaming && isLast && i === msg.toolCalls!.length - 1
                            ? 'running'
                            : 'completed'
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Main content */}
                {msg.content && (
                  <MarkdownContent
                    content={msg.content}
                    isStreaming={isStreaming && isLast}
                    citations={msg.citations}
                  />
                )}

                {/* Artifacts */}
                {msg.artifacts && msg.artifacts.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {msg.artifacts.map((artifact, i) => (
                      <ArtifactCard key={artifact.id || i} artifact={artifact} />
                    ))}
                  </div>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5 flex items-center gap-1.5">
                      <Search size={10} />
                      Sources
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((cite, i) => (
                        <a
                          key={i}
                          id={`cite-${cite.id}`}
                          href={cite.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/5 text-[10px] text-zinc-400 hover:text-[#FF3366] hover:border-[#FF3366]/20 transition-all"
                        >
                          <Globe size={9} />
                          <span className="truncate max-w-[200px]">
                            {cite.source || cite.title || cite.url}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {!isStreaming && (
                  <>
                    <MessageActions
                      index={index}
                      content={msg.content}
                      onCopy={onCopy}
                      copiedId={copiedId}
                      msgId={msgId}
                      isUser={false}
                      onRegenerate={onRegenerate}
                      onBranch={onBranch}
                      activeModel={activeModel}
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
                <div className="text-zinc-500 text-xs italic py-1">Empty response from model.</div>
              )}
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
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6 gap-6 relative overflow-hidden"
  >
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-[#FF3366]/[0.02] rounded-full blur-[90px] pointer-events-none select-none -z-10 animate-pulse" />

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
        <div className="absolute w-24 h-24 bg-[#FF3366]/[0.08] rounded-full blur-[45px] pointer-events-none select-none transform-gpu" />
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
          NY<span className="text-[#FF3366]">X</span>
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
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full mt-4"
      >
        {suggestedPrompts.slice(0, 4).map((p, idx) => (
          <motion.button
            key={idx}
            whileHover={{
              scale: 1.01,
              backgroundColor: 'rgba(255, 51, 102, 0.05)',
              borderColor: 'rgba(255, 51, 102, 0.2)',
            }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSuggestedPromptClick?.(p)}
            className="p-4 text-[11px] font-bold text-left rounded-2xl bg-white/[0.01] border border-white/5 text-foreground/75 hover:text-[#FF3366] transition-all duration-200 cursor-pointer flex items-center justify-between shadow-sm"
          >
            <span>{p}</span>
            <span className="text-[10px] text-[#FF3366]/70 font-extrabold ml-2">➔</span>
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
        return msg ? `${msg.timestamp}-${index}-${msg.content?.length || 0}` : index;
      },
      [history]
    ),
  });

  // Smart scroll: auto-scroll only if user was near bottom
  useEffect(() => {
    if (history.length > lastHistoryLength.current) {
      // New message added
      if (autoScroll) {
        requestAnimationFrame(() => {
          rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
        });
      }
    } else if (isLoading && autoScroll) {
      // Streaming content update
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
      });
    }
    lastHistoryLength.current = history.length;
  }, [history, isLoading, autoScroll, rowVirtualizer]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const threshold = 100;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < threshold;
    setAutoScroll(isNearBottom.current);
    setShowJumpToBottom(!isNearBottom.current && history.length > 2);
  }, [history.length]);

  const jumpToBottom = useCallback(() => {
    if (history.length > 0) {
      rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
      setAutoScroll(true);
      isNearBottom.current = true;
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
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative"
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
            className="w-full max-w-3xl mx-auto px-4 pb-6 pt-4 relative"
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
                      activeModel={activeModel}
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
            className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-card/90 border border-border text-foreground/70 hover:text-foreground shadow-xl text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-all hover:bg-muted/90 cursor-pointer"
          >
            <ArrowDown className="w-3 h-3" />
            Latest
            {isLoading && <span className="w-1.5 h-1.5 rounded-full bg-[#FF3366] animate-pulse" />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* New messages indicator */}
      {!autoScroll && isLoading && (
        <div className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-2 pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-[#FF3366]/10 border border-[#FF3366]/20 text-[10px] text-[#FF3366] font-semibold animate-pulse">
            Generating...
          </div>
        </div>
      )}
    </div>
  );
};
