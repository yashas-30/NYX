// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatMessageList.tsx
 * @description Production-grade message list with reasoning display,
 *   tool visualization, branching, and Claude/Kimi-parity UX.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CopyIcon as Copy, CheckIcon as Check, TerminalIcon as Terminal, ThumbsUpIcon as ThumbsUp, ThumbsDownIcon as ThumbsDown, GitBranchIcon as GitBranch, ChevronDownIcon as ChevronDown, ChevronRightIcon as ChevronRight, XIcon as X, SparklesIcon as Sparkles, DownloadIcon as Download } from '@animateicons/react/lucide';
import { ArrowDown, Pencil, RefreshCw, Wrench, FileText, Image as ImageIcon, Clock, AlertTriangle, Loader2, Square, Volume2, VolumeX } from 'lucide-react';
import { ChatMessage, ToolCall, StreamEvent } from '@src/infrastructure/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { CodeBlock } from '../../../components/chat/CodeBlock';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { toast } from '@src/shared/components/ui/sonner';
import { AVAILABLE_MODELS } from '@src/shared/config/models';
import { Logo, NyxLoader, AnimatedLogo } from '@src/assets/icons/icons';
import { ThinkingBlock } from './ThinkingBlock';
import { ArtifactPanel } from './ArtifactPanel';
import { Citation, CitationCard } from './CitationCard';
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

  activeModel?: string;
  onArtifactClick?: (artifact: any) => void;
  approveTool?: (index: number, approvalId: string) => void;
  rejectTool?: (index: number, approvalId: string) => void;
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
}

// ---------------------------------------------------------------------------
// Tool Call Visualizer
// ---------------------------------------------------------------------------

const formatToolAction = (name: string, argsStr: string, status: string) => {
  let args: any = {};
  try { args = JSON.parse(argsStr || '{}'); } catch {}

  const isDone = status === 'completed' || status === 'success';
  const prefix = isDone ? 'Finished' : (status === 'error' ? 'Failed to' : 'Using');

  switch (name) {
    case 'searchWeb':
    case 'web_search':
      return isDone ? 'Searched the web' : 'Searching the web...';
    case 'agent_handoff':
      return isDone ? `Received context from ${args.agent}` : `Handed off task to ${args.agent}...`;
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
      // Generic fallback: "searchWeb" -> "Search web"
      const formattedName = name.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
      return `${prefix} ${formattedName.toLowerCase()}...`;
  }
};

const ToolCallCard: React.FC<{
  tool: ToolCall;
  status: 'pending' | 'running' | 'completed' | 'success' | 'error';
}> = memo(({ tool, status }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = status === 'running';
  const isError = status === 'error';
  const isDone = status === 'completed' || status === 'success';

  const actionText = formatToolAction(tool.function.name, tool.function.arguments, status);

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
                {tool.function.name} Inputs
              </div>
              <pre className="text-[11px] font-mono text-foreground/80 bg-muted/20 rounded-md p-3 overflow-x-auto border border-border/30">
                {JSON.stringify(JSON.parse(tool.function.arguments || '{}'), null, 2)}
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
              ? `${(window as Record<string, any>).__NYX_BACKEND_URL__ || ''}${src}`
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
    <span className="w-[7px] h-[14px] bg-accent/70 rounded-sm animate-pulse" />
  </span>
));
StreamingCursor.displayName = 'StreamingCursor';

// ---------------------------------------------------------------------------
// Markdown Renderer
// ---------------------------------------------------------------------------
import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';

const MemoizedMarkdownBlock: React.FC<{
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
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
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
        <h1 className="text-xl font-sans font-semibold tracking-tight text-foreground mt-6 mb-3 pb-2 border-b border-border animate-smooth-reveal">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-lg font-sans font-semibold tracking-tight text-foreground mt-5 mb-3 animate-smooth-reveal">
          {children}
        </h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-base font-sans font-semibold tracking-tight text-foreground/90 mt-4 mb-2 animate-smooth-reveal">
          {children}
        </h3>
      ),
      p: ({ children }: any) => (
        <p className="text-[15px] md:text-[16px] font-sans antialiased leading-[1.75] tracking-[0.01em] text-foreground/90 my-3 animate-smooth-reveal">{children}</p>
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
        <blockquote className="my-2 py-3 px-4 bg-muted/30 rounded-md text-sm text-muted-foreground">
          {children}
        </blockquote>
      ),
      hr: () => <div className="my-4 h-px w-full bg-border" />,
      a: ({ href, children }: any) => {
        if (href?.startsWith('#cite-')) {
          const id = href.replace('#cite-', '');
          const cite = citations?.find((c) => c.id === id || String(c.index) === id);
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
    [citations]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
      {processedContent}
    </ReactMarkdown>
  );
},
(prevProps, nextProps) => {
  if (prevProps.content !== nextProps.content) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  // Only re-render if citations count changes
  if ((prevProps.citations?.length || 0) !== (nextProps.citations?.length || 0)) return false;
  return true;
});
MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

const MarkdownContent: React.FC<{
  content: string;
  blocks?: string[];
  isStreaming?: boolean;
  citations?: Citation[];
}> = memo(({ content, blocks, isStreaming, citations }) => {
  // Hide raw XML artifact tags from being rendered in text bubble
  const cleanText = (text: string) => {
    return text.replace(/<nyx_artifact[\s\S]*?(?:<\/nyx_artifact>|$)/g, '');
  };

  const cleanedContent = cleanText(content);
  const blocksToRender = blocks?.length 
    ? blocks.map(b => cleanText(b)) 
    : [cleanedContent];
  
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

        {!isUser && onBranch && (
          <button
            onClick={() => onBranch(index)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 transition-all cursor-pointer font-medium"
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
    approveTool,
    rejectTool,
  }) => {
    const isUser = msg.role === 'user';
    const [isExpanded, setIsExpanded] = useState(false);
    const msgId = `${msg.timestamp}-${index}`;
    
    // Process <think> tags natively from content if reasoning is empty or merged
    let parsedReasoning = msg.reasoning || '';
    let parsedContent = msg.content || '';
    
    if (parsedContent.includes('<think>')) {
      const match = parsedContent.match(/<think>([\s\S]*?)<\/think>/);
      if (match) {
        parsedReasoning = match[1];
        parsedContent = parsedContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      } else if (msg.status === 'loading') {
        const startMatch = parsedContent.match(/<think>([\s\S]*)/);
        if (startMatch) {
          parsedReasoning = startMatch[1];
          parsedContent = parsedContent.substring(0, startMatch.index).trim();
        }
      }
    }

    // Show "Thinking..." spinner ONLY when streaming has started but no content or reasoning yet
    const isThinking =
      isStreaming && !parsedContent && !parsedReasoning &&
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
            <div className="py-3.5 px-5 bg-muted/25 border border-border rounded-2xl hover:bg-muted/30 transition-all shadow-sm">
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
                <div className="flex items-baseline gap-2 mb-1 select-none pl-11">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    {displayName}
                  </span>
                </div>
              );
            })()}

            <div className="flex w-full gap-3 items-start relative">

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
                    const errorMessage = msg.content || "Error: Generation failed. Please check your model settings or connection.";
                    const cleanErrorMessage = errorMessage.startsWith("Error: Error:") 
                      ? errorMessage.substring(7) 
                      : errorMessage;
                    return (
                      <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-red-500/5 border border-red-500/10">
                        <AlertTriangle size={14} className="text-red-400 shrink-0" />
                        <p className="text-sm text-red-400/90 font-medium">
                          {cleanErrorMessage}
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
                {isThinking && !parsedReasoning && (
                  <div className="flex items-center gap-2.5 py-1 select-none h-14">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.15em] animate-pulse">
                      Starting reasoning...
                    </span>
                  </div>
                )}

                {/* Content rendering */}
                {(parsedContent || (msg.toolCalls && msg.toolCalls.length > 0) || parsedReasoning) && (
                  <div className="pl-0">
                    {/* Reasoning block */}
                    {parsedReasoning && (
                      <ThinkingBlock 
                        content={parsedReasoning} 
                        responseContent={parsedContent}
                        isComplete={
                          (!isStreaming && msg.status !== 'loading') || 
                          (!!parsedContent && parsedContent.length > 0) || 
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
                                  status={t.status as 'pending' | 'running' | 'success' | 'error'}
                                />
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Main content */}
                    {parsedContent && msg.status !== 'error' && (
                      <MarkdownContent
                        content={parsedContent}
                        blocks={(msg as Record<string, any>).blocks}
                        isStreaming={isStreaming && isLast}
                        citations={msg.citations}
                      />
                    )}

                    {/* Artifacts */}
                    {(() => {
                      const completeArtifacts = msg.artifacts || [];
                      let streamingArtifacts: any[] = [];
                      if (isStreaming && isLast && parsedContent) {
                        const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
                        let match;
                        while ((match = codeBlockRegex.exec(parsedContent)) !== null) {
                          const isClosed = parsedContent.substring(match.index).includes('```', match[1].length + 3);
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
                                <div key={`streaming-${i}`} className="rounded-md border border-border bg-surface overflow-hidden flex flex-col my-4 shadow-sm w-full p-4 cursor-default">
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
                                className="cursor-pointer group flex items-center justify-between p-3.5 my-3 rounded-xl border border-border/60 bg-surface hover:bg-muted/30 hover:border-primary/40 hover:shadow-sm transition-all"
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

                    {/* Tool Approval UI Gate */}
                    {(msg as Record<string, any>).pendingApproval && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="my-4 p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="text-amber-500 w-5 h-5 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <span>Tool Authorization Required</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-mono font-bold uppercase">
                                Gate
                              </span>
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              The agent wants to execute a destructive or modifying action. Please review the parameters below before allowing:
                            </p>
                            <div className="mt-3 bg-muted/40 border border-border/40 rounded-lg p-3 overflow-x-auto">
                              <div className="text-[11px] font-mono text-foreground font-bold mb-1.5 flex items-center gap-1.5">
                                <Wrench size={10} className="text-muted-foreground" />
                                <span>{(msg as Record<string, any>).pendingApproval.tool}</span>
                              </div>
                              <pre className="text-[10.5px] font-mono text-muted-foreground whitespace-pre-wrap">
                                {JSON.stringify((msg as Record<string, any>).pendingApproval.input || {}, null, 2)}
                              </pre>
                            </div>
                            <div className="flex items-center gap-3 mt-4">
                              <button
                                onClick={() => rejectTool?.(index, (msg as Record<string, any>).pendingApproval.approvalId)}
                                className="px-3.5 py-1.5 rounded-md border border-red-500/30 text-red-500 bg-red-500/5 hover:bg-red-500/10 text-xs font-semibold cursor-pointer transition-colors"
                              >
                                Reject Action
                              </button>
                              <button
                                onClick={() => approveTool?.(index, (msg as Record<string, any>).pendingApproval.approvalId)}
                                className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-sm"
                              >
                                Approve & Execute
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Actions */}
                    {!isStreaming && (
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
    return true; // functions are ignored
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
  // 4 hardcoded context-appropriate chips shown when no model-generated suggestions available
  const defaultChips = [
    'Explain this codebase architecture',
    'Debug this function for me',
    'Write unit tests for this module',
    'Review my code for improvements',
  ];
  const chips = (suggestedPrompts && suggestedPrompts.length > 0 ? suggestedPrompts : defaultChips).slice(0, 4);

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
          NY<span className="text-primary">X</span>
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const jumpToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: history.length - 1, behavior: 'smooth' });
    setAutoScroll(true);
    setShowJumpToBottom(false);
  }, [history.length]);

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
              {/* Optimistic submit indicator — 3 dots, offset stagger */}
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                    className="w-1.5 h-1.5 rounded-full bg-primary/70"
                  />
                ))}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground/50 tracking-wide uppercase">
                Thinking
              </span>
            </motion.div>
          ) : (
            <EmptyState
              suggestedPrompts={suggestedPrompts}
              onSuggestedPromptClick={onSuggestedPromptClick}
            />
          )
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={history}
            className="w-full h-full custom-scrollbar"
            atBottomStateChange={(atBottom) => {
              if (atBottom) {
                setAutoScroll(true);
                setShowJumpToBottom(false);
              } else {
                setAutoScroll(false);
                setShowJumpToBottom(true);
              }
            }}
            followOutput={autoScroll ? "smooth" : false}
            itemContent={(index, msg) => {
              if (!msg) return null;

              const isLast = index === history.length - 1;
              const isStreaming = isLast && isLoading;

              return (
                <div className="py-3 px-4 md:px-6 w-full">
                  <MessageBubble
                    msg={msg}
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
                  />
                </div>
              );
            }}
          />
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
    </div>
  );
};

