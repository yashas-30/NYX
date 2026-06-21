import { AnimatedIcon } from '@shared/components/ui/animated-icon';
// fallow-ignore-file code-duplication
/**
 * @file src/features/orchestrator/components/OrchestratorUI.tsx
 * @description Production-grade orchestrator UI with streaming animation,
 *   collapsible reasoning, message actions, and Claude/Kimi-parity UX.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  useOrchestrator,
  OrchestratorMessage,
  ThinkingStep,
  ToolCall,
  Artifact,
} from '../hooks/useOrchestrator';
import { StreamEvent } from '@src/types/agent';
import { LocalModelConfig, HardwareProfile, LocalTool } from '@src/types/inference';
import { Button } from '@src/shared/components/ui/button';
import { ScrollArea } from '@src/shared/components/ui/scroll-area';
import { Input } from '@src/shared/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { SendIcon as Send, Trash2Icon as Trash2, CopyIcon as Copy, CheckIcon as Check, ChevronDownIcon as ChevronDown, ChevronRightIcon as ChevronRight, ZapIcon as Zap, TerminalIcon as Terminal, SparklesIcon as Sparkles } from '@animateicons/react/lucide';
import { Square, RefreshCw, Bot, Cpu, Clock, FileCode, Image as ImageIcon, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from '@src/shared/components/ui/sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrchestratorUIProps {
  models: LocalModelConfig[];
  hardware: HardwareProfile;
  tools: LocalTool[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const PhaseBadge: React.FC<{ phase: string; active: boolean }> = memo(({ phase, active }) => {
  const colors: Record<string, string> = {
    analyzing: 'bg-purple-900/40 text-purple-300 border-purple-500/20',
    selecting_model: 'bg-blue-900/40 text-blue-300 border-blue-500/20',
    reasoning: 'bg-amber-900/40 text-amber-300 border-amber-500/20',
    generating: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/20',
    tool_calling: 'bg-cyan-900/40 text-cyan-300 border-cyan-500/20',
    executing_tools: 'bg-cyan-900/40 text-cyan-300 border-cyan-500/20',
    error: 'bg-red-900/40 text-red-300 border-red-500/20',
  };

  const labels: Record<string, string> = {
    analyzing: 'Analysis',
    selecting_model: 'Routing',
    reasoning: 'Thinking',
    generating: 'Generating',
    tool_calling: 'Tools',
    executing_tools: 'Tools',
    error: 'Error',
  };

  return (
    <motion.span
      initial={false}
      animate={active ? { scale: 1.05 } : { scale: 1 }}
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-all ${
        active
          ? colors[phase] || colors.generating
          : 'bg-transparent text-[#555] border-transparent'
      }`}
    >
      {labels[phase] || phase}
    </motion.span>
  );
});
PhaseBadge.displayName = 'PhaseBadge';

const ThinkingBlock: React.FC<{ steps: ThinkingStep[]; isStreaming?: boolean }> = memo(
  ({ steps, isStreaming }) => {
    const [expanded, setExpanded] = useState(true);

    if (!steps?.length && !isStreaming) return null;

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="bg-card border border-border rounded-md overflow-hidden"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <Sparkles size={12} className="text-amber-400" />
          <span className="text-[11px] font-semibold text-amber-400/80">
            {isStreaming ? 'Thinking...' : 'Reasoning Process'}
          </span>
          {isStreaming && (
            <span className="w-1.5 h-1.5 rounded-md bg-amber-400 animate-pulse ml-1" />
          )}
          <span className="ml-auto">
            {expanded ? (
              <ChevronDown size={12} className="text-[#555]" />
            ) : (
              <ChevronRight size={12} className="text-[#555]" />
            )}
          </span>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 border-t border-[#2A2A2E] space-y-1.5">
                {steps.map((t) => (
                  <div key={t.id} className="flex gap-2 text-[12px] text-[#A0A0A0] leading-relaxed">
                    <span className="text-[#444] select-none font-mono text-[10px] mt-0.5">
                      {t.step}.
                    </span>
                    <span>{t.content}</span>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex gap-1 items-center h-3">
                    <span className="w-1 h-1 bg-amber-400/50 rounded-md animate-pulse" />
                    <span className="w-1 h-1 bg-amber-400/50 rounded-md animate-pulse delay-75" />
                    <span className="w-1 h-1 bg-amber-400/50 rounded-md animate-pulse delay-150" />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
);
ThinkingBlock.displayName = 'ThinkingBlock';

const ToolCallCard: React.FC<{ call: ToolCall }> = memo(({ call }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-[#1a1a1e] border border-blue-900/30 rounded-md overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <Terminal size={12} className="text-blue-400 shrink-0" />
        <span className="text-[11px] font-mono text-blue-400">{call.tool}</span>
        {call.status === 'running' && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-blue-400/70">
            <span className="w-1 h-1 bg-blue-400 rounded-md animate-pulse" />
            Running
          </span>
        )}
        {(call.status === 'completed' || call.status === 'success') && (
          <Check size={12} className="text-emerald-400 ml-auto" />
        )}
        {call.status === 'error' && <AnimatedIcon icon={AlertCircle} size={12} className="text-red-400 ml-auto" />}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown size={12} className="text-[#555]" />
          ) : (
            <ChevronRight size={12} className="text-[#555]" />
          )}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-[#2A2A2E]">
              <pre className="text-[11px] font-mono text-[#888] bg-black/20 rounded p-2 overflow-x-auto">
                {JSON.stringify(call.input, null, 2)}
              </pre>
              {(call.output || call.result) && (
                <div className="mt-2 pt-2 border-t border-[#2A2A2E]">
                  <span className="text-[10px] text-emerald-400/70 font-medium uppercase tracking-wider">
                    Output
                  </span>
                  <pre className="text-[11px] font-mono text-[#A0A0A0] mt-1 overflow-x-auto">
                    {typeof call.output === 'string'
                      ? call.output
                      : call.result?.content || JSON.stringify(call.output || call.result, null, 2)}
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

const ArtifactCard: React.FC<{ artifact: Artifact }> = memo(({ artifact }) => {
  const icons: Record<string, React.ReactNode> = {
    code: <AnimatedIcon icon={FileCode} size={14} className="text-blue-400" />,
    image: <AnimatedIcon icon={ImageIcon} size={14} className="text-purple-400" />,
    document: <AnimatedIcon icon={FileCode} size={14} className="text-emerald-400" />,
  };

  return (
    <motion.div
      whileHover={{ borderColor: 'var(--primary)' }}
      className="bg-card border border-border hover:border-primary/30 cursor-pointer transition-all rounded-md p-3 group"
    >
      <div className="flex items-center gap-2 mb-1">
        {icons[artifact.type] || icons.document}
        <span className="font-medium text-[13px] text-foreground group-hover:text-primary transition-colors">
          {artifact.title}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{artifact.type}</div>
    </motion.div>
  );
});
ArtifactCard.displayName = 'ArtifactCard';

const CodeBlock: React.FC<{ language: string; code: string }> = memo(({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Code copied');
    });
  }, [code]);

  return (
    <div className="relative group/code my-3 rounded-md border border-[#2A2A2E] bg-[#0d1117] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#2A2A2E]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#555]">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-[#666] hover:text-white hover:bg-white/5 transition-all cursor-pointer"
        >
          {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '12px',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

const StreamingCursor: React.FC = memo(() => (
  <span className="inline-flex items-center ml-1 gap-0.5">
    <span className="w-[6px] h-[14px] bg-blue-400/60 rounded-sm animate-pulse" />
  </span>
));
StreamingCursor.displayName = 'StreamingCursor';

const MarkdownRenderer: React.FC<{ content: string; isStreaming?: boolean }> = memo(
  ({ content, isStreaming }) => {
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
              className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-blue-300 text-[11px] font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        h1: ({ children }: any) => (
          <h1 className="text-base font-bold text-[#E0E0E0] mt-4 mb-2 pb-2 border-b border-[#2A2A2E]">
            {children}
          </h1>
        ),
        h2: ({ children }: any) => (
          <h2 className="text-[14px] font-bold text-[#E0E0E0] mt-3 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 rounded-md bg-blue-500 inline-block" />
            {children}
          </h2>
        ),
        p: ({ children }: any) => (
          <p className="text-[14px] leading-[1.7] text-[#D1D1D1] my-2">{children}</p>
        ),
        ul: ({ children }: any) => (
          <ul className="list-disc pl-5 space-y-1 my-2 text-[14px] text-[#D1D1D1]">{children}</ul>
        ),
        ol: ({ children }: any) => (
          <ol className="list-decimal pl-5 space-y-1 my-2 text-[14px] text-[#D1D1D1]">
            {children}
          </ol>
        ),
        li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
        a: ({ href, children }: any) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }: any) => (
          <blockquote className="my-2 pl-3 py-1 border-l border-blue-500/40 bg-white/[0.01] rounded-r text-[#A0A0A0] italic">
            {children}
          </blockquote>
        ),
      }),
      []
    );

    return (
      <div className="prose-nyx w-full max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
        {isStreaming && <StreamingCursor />}
      </div>
    );
  }
);
MarkdownRenderer.displayName = 'MarkdownRenderer';

const MessageActions: React.FC<{
  content: string;
  onCopy: () => void;
  onRegenerate?: () => void;
  copied: boolean;
}> = memo(({ onCopy, onRegenerate, copied }) => (
  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
    <button
      onClick={onCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#555] hover:text-blue-400 hover:bg-white/[0.03] transition-all cursor-pointer"
    >
      {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
    {onRegenerate && (
      <button
        onClick={onRegenerate}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#555] hover:text-blue-400 hover:bg-white/[0.03] transition-all cursor-pointer"
      >
        <AnimatedIcon icon={RefreshCw} size={10} />
        <span>Regenerate</span>
      </button>
    )}
  </div>
));
MessageActions.displayName = 'MessageActions';

const AssistantMessage: React.FC<{
  msg: OrchestratorMessage;
  isStreaming: boolean;
  onCopy: (text: string, id: string) => void;
  onRegenerate?: () => void;
  copiedId: string | null;
}> = memo(({ msg, isStreaming, onCopy, onRegenerate, copiedId }) => {
  const isCopied = copiedId === msg.id;

  return (
    <div className="w-full space-y-3 group">
      {/* Model info */}
      {msg.metrics?.modelUsed && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#666] font-medium">
          <AnimatedIcon icon={Bot} size={10} className="text-emerald-500/50" />
          <span>{msg.metrics.modelUsed}</span>
          <span className="text-[#444]">•</span>
          <AnimatedIcon icon={Clock} size={10} className="text-[#444]" />
          <span>{msg.metrics.latencyMs}ms</span>
          {msg.metrics.tokens && (
            <>
              <span className="text-[#444]">•</span>
              <AnimatedIcon icon={Cpu} size={10} className="text-[#444]" />
              <span>{msg.metrics.tokens} tok</span>
            </>
          )}
        </div>
      )}

      {/* Reasoning */}
      <ThinkingBlock
        steps={msg.thinking || []}
        isStreaming={isStreaming && msg.status === 'streaming'}
      />

      {/* Tool calls */}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="space-y-1.5">
          {msg.toolCalls.map((t) => (
            <ToolCallCard key={t.id} call={t} />
          ))}
        </div>
      )}

      {/* Content */}
      {msg.content && (
        <div className="text-[15px] leading-relaxed text-[#D1D1D1]">
          <MarkdownRenderer
            content={msg.content}
            isStreaming={isStreaming && msg.status === 'streaming'}
          />
        </div>
      )}

      {/* Empty streaming state */}
      {!msg.content && isStreaming && msg.status === 'streaming' && (
        <div className="flex gap-1 items-center h-5">
          <span
            className="w-1.5 h-1.5 bg-blue-500 rounded-md animate-pulse"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 h-1.5 bg-blue-500 rounded-md animate-pulse"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 h-1.5 bg-blue-500 rounded-md animate-pulse"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      )}

      {/* Actions */}
      {!isStreaming && (
        <MessageActions
          content={msg.content}
          onCopy={() => onCopy(msg.content, msg.id)}
          onRegenerate={onRegenerate}
          copied={isCopied}
        />
      )}
    </div>
  );
});
AssistantMessage.displayName = 'AssistantMessage';

// ---------------------------------------------------------------------------
// Smart scroll hook (Claude/Kimi behavior)
// ---------------------------------------------------------------------------

function useSmartScroll<T>(deps: React.DependencyList) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
      setShowJumpButton(false);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement;
    if (!el) return;
    const threshold = 100;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottomRef.current = nearBottom;
    setShowJumpButton(!nearBottom);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, deps);

  return { containerRef, scrollToBottom, handleScroll, showJumpButton };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OrchestratorUI({ models, hardware, tools }: OrchestratorUIProps) {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isProcessing,
    currentPhase,
    selectedModel,
    analysis,
    sendMessage,
    stop,
    clear,
    regenerate,
  } = useOrchestrator(models, hardware, tools);

  const { containerRef, scrollToBottom, handleScroll, showJumpButton } = useSmartScroll([
    messages,
    currentPhase,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProcessing) {
        stop();
      }
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement !== inputRef.current
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, stop]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isProcessing) return;
      sendMessage(input.trim());
      setInput('');
      // Focus back after submit
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [input, isProcessing, sendMessage]
  );

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Copied to clipboard');
    });
  }, []);

  const allArtifacts = useMemo(() => messages.flatMap((m) => m.artifacts || []), [messages]);

  const phases = ['analyzing', 'selecting_model', 'reasoning', 'generating', 'executing_tools'];

  return (
    <div className="flex h-full w-full bg-background text-foreground/90 font-sans">
      {/* LEFT PANEL - Chat */}
      <div className="flex-1 flex flex-col border-r border-border min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <h2 className="font-semibold text-sm tracking-wide">Orchestrator</h2>
            {isProcessing && (
              <span className="flex items-center gap-1.5 text-[10px] text-blue-400/70 ml-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-md animate-pulse" />
                Active
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {isProcessing ? (
              <Button
                onClick={stop}
                variant="destructive"
                size="sm"
                className="h-8 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 border-red-500/20"
              >
                <AnimatedIcon icon={Square} size={12} className="mr-1" fill="currentColor" />
                Stop
              </Button>
            ) : (
              <Button
                onClick={clear}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-[#2A2A2E] hover:bg-[#2A2A2E] text-[#888]"
              >
                <Trash2 size={12} className="mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 relative" ref={containerRef} onScrollCapture={handleScroll}>
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-24">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`flex flex-col gap-2 ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%]">
                      <div className="bg-[#2A2A2E] text-white px-4 py-3 rounded-md rounded-tr-sm shadow-sm text-[14px] leading-relaxed">
                        {msg.content}
                      </div>
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 justify-end">
                          {msg.images.map((img, i) => (
                            <div
                              key={i}
                              className="w-20 h-20 rounded-md bg-[#1a1a1e] border border-[#2A2A2E] overflow-hidden"
                            >
                              <img
                                src={img.url || `data:${img.mimeType};base64,${img.data}`}
                                alt={img.name || 'user-attachment'}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <AssistantMessage
                      msg={msg}
                      isStreaming={isProcessing && idx === messages.length - 1}
                      onCopy={handleCopy}
                      onRegenerate={() => regenerate(msg.id)}
                      copiedId={copiedId}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Jump to bottom */}
          <AnimatePresence>
            {showJumpButton && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={scrollToBottom}
                className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3 py-2 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-wider shadow-md cursor-pointer"
              >
                <span>Latest</span>
                {isProcessing && (
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-md animate-pulse" />
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 bg-card border-t border-border shrink-0">
          <div className="max-w-3xl mx-auto flex flex-col gap-2">
            {/* Phase indicators */}
            {isProcessing && (
              <div className="flex gap-2 text-xs font-mono mb-1 overflow-x-auto pb-1">
                {phases.map((phase) => (
                  <PhaseBadge key={phase} phase={phase} active={currentPhase === phase} />
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the orchestrator... (Press / to focus)"
                disabled={isProcessing}
                className="bg-[#2A2A2E] border-none text-white placeholder-[#666] h-12 px-4 focus-visible:ring-1 focus-visible:ring-blue-500/50 text-[14px]"
              />
              <Button
                type="submit"
                disabled={isProcessing || !input.trim()}
                className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium shrink-0"
              >
                <Send size={16} />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - State */}
      <div className="w-80 flex flex-col bg-[#121214] shrink-0">
        <div className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-muted/10">
          <h3 className="font-semibold text-sm tracking-wide text-foreground/80">Session State</h3>
        </div>
        <ScrollArea className="flex-1 p-4 bg-background/30">
          <div className="space-y-6">
            {/* Active Model */}
            {selectedModel && (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                  Active Route
                </h4>
                <div className="bg-card border border-border rounded-md p-3 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-medium text-[13px]">
                      {selectedModel.model.name}
                    </span>
                    <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-[10px]">
                      {selectedModel.isPureGpu ? 'GPU' : 'Split'}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed text-[11px]">{selectedModel.reason}</p>
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <span className="bg-muted px-2 py-0.5 rounded text-[10px] text-muted-foreground">
                      {selectedModel.gpuLayers} Layers
                    </span>
                    <span className="bg-muted px-2 py-0.5 rounded text-[10px] text-muted-foreground">
                      {Math.round(selectedModel.estimatedVramMB)}MB
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis */}
            {analysis && (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                  Intent Analysis
                </h4>
                <div className="bg-card border border-border rounded-md p-3 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Intent</span>
                    <span className="text-emerald-400 font-medium">{analysis.intent}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Complexity</span>
                    <span className="text-amber-400 font-medium">
                      {typeof analysis.complexity === 'string'
                        ? analysis.complexity
                        : analysis.complexity?.level || 'moderate'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Tools</span>
                    <span className="text-purple-400 font-medium">
                      {analysis.requiresTools ? 'Required' : 'None'}
                    </span>
                  </div>

                  {analysis.reasoning && (
                    <p className="text-muted-foreground text-[11px] leading-relaxed pt-2 border-t border-border">
                      {analysis.reasoning}
                    </p>
                  )}
                  {analysis.confidence && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="text-primary font-medium">
                        {Math.round(analysis.confidence * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Token usage */}
            {messages.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                  Usage
                </h4>
                <div className="bg-card border border-border rounded-md p-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Messages</span>
                    <span className="text-foreground">{messages.length}</span>
                  </div>
                  <div className="w-full h-1 bg-muted rounded-md overflow-hidden">
                    <div
                      className="h-full bg-primary/50 rounded-md transition-all"
                      style={{ width: `${Math.min((messages.length / 50) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Artifacts */}
            {allArtifacts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] uppercase text-[#666] font-bold tracking-wider">
                  Artifacts ({allArtifacts.length})
                </h4>
                <div className="space-y-2">
                  {allArtifacts.map((art) => (
                    <ArtifactCard key={art.id} artifact={art} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
