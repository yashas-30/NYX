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
import { AVAILABLE_MODELS } from '@src/shared/config/models';
import { Logo, NyxLoader, CatLoader, AnimatedLogo } from '@src/assets/icons/icons';
import { ThinkingBlock } from './ThinkingBlock';
import { ArtifactPanel } from './ArtifactPanel';
import { CitationCard } from './CitationCard';
import { SearchResultsPanel } from './SearchResultsPanel';
import { MemoryPanel } from './MemoryPanel';
import { ArtifactViewer } from '../../../components/artifacts/ArtifactViewer';

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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
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

const MarkdownContent: React.FC<{
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
}> = memo(({ content, isStreaming, citations }) => {
  const deferredContent = React.useDeferredValue(content);
  
  let processedContent = deferredContent;
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
              title={cite?.source || cite?.url}
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
      <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
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
    activeModel,
    onArtifactClick,
  }) => {
    const isUser = msg.role === 'user';
    const msgId = `${msg.timestamp}-${index}`;
    // Used for the reasoning text loading state if there are no tool calls
    const isThinking =
      ((msg.status === 'loading' && !msg.content) || (isStreaming && !msg.content && msg.reasoning)) &&
      (!msg.toolCalls || msg.toolCalls.length === 0);
      
    // Used to show the animated loader instead of the cat icon during response generation
    const isLoadingIcon = msg.status === 'loading' || (isStreaming && isLast);

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}
      >
        {isUser ? (
          <div className="max-w-[85%] sm:max-w-[75%]">
            <div className="py-3.5 px-5 bg-muted/10 border border-border rounded-md hover:bg-muted/20 transition-all">
              <div className="text-[14px] font-normal leading-relaxed text-foreground select-text whitespace-pre-wrap">
                {msg.content}
              </div>
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
            />
          </div>
        ) : (
          <div className="flex flex-col w-full animate-fade-in">
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
                <div className="flex items-baseline gap-2 mb-1 select-none pl-[68px]">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    {displayName}
                  </span>
                </div>
              );
            })()}

            <div className="flex w-full gap-1 items-start">
              <div className="flex-shrink-0 pt-0.5 select-none">
                <div className="w-16 h-16 flex items-center justify-center hover:scale-105 transition-all duration-300 overflow-hidden">
                  {isLoadingIcon ? (
                    <NyxLoader size={28} className="text-foreground animate-spin" />
                  ) : (
                    <AnimatedLogo size={64} className="animate-fade-in" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {/* Error state */}
                {msg.status === 'error' && (
                  <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-red-500/5 border border-red-500/10">
                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                    <p className="text-sm text-red-400/90 font-medium">
                      Error: Generation failed. Please check your model settings or connection.
                    </p>
                  </div>
                )}

                {/* Stopped state */}
                {msg.status === 'stopped' && (
                  <p className="text-sm text-muted-foreground py-1 italic flex items-center gap-2">
                    <Square size={10} className="text-muted-foreground" />
                    Generation stopped by user.
                  </p>
                )}

                {/* Loading / Thinking state (during reasoning or initial Formulation) */}
                {isThinking && (
                  <div className="flex items-center gap-2.5 py-1 select-none h-14">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.15em] animate-pulse">
                      Thinking...
                    </span>
                  </div>
                )}

                {/* Content rendering */}
                {(msg.content || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                  <div className="pl-0">
                    {/* Reasoning block is hidden to keep the response page clean as requested */}

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
                          <div 
                            key={artifact.id || i}
                            onClick={() => onArtifactClick?.(artifact)}
                            className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all rounded-md"
                          >
                            <ArtifactViewer artifact={artifact as any} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-border">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
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
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-[10px] text-muted-foreground hover:text-primary hover:border-primary/20 transition-all"
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
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
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
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full mt-4"
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
