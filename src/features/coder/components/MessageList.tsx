import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ArrowDown, Terminal, Play, Save, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { ChatMessage } from '@/src/core/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Logo } from '@/src/lib/design-system/icons';
import { toast } from '@/src/components/ui/sonner';

/* ─────────────────────────────────────────────────────────────────────────────
 * Code Block
 * ───────────────────────────────────────────────────────────────────────────── */

const detectFilePath = (code: string): string => {
  const firstLine = code.split('\n')[0]?.trim() || '';
  const match = firstLine.match(/^(?:\/\/\/|\/\/|#|\/\*|--|'|;)\s*(?:filepath:\s*|@file\s*|file:\s*)?([\w.\/\\_-]+\.\w+)\b/i);
  if (match) {
    return match[1].replace(/^\.\//, '').replace(/^\.\\/, '');
  }
  return '';
};

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'writing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Terminal Execution State
  const [showTerminal, setShowTerminal] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');

  useEffect(() => {
    const detected = detectFilePath(code);
    if (detected) {
      setFilePath(detected);
    }
  }, [code]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const handleApplyFile = async () => {
    if (!filePath.trim()) {
      toast.error('File path is required');
      return;
    }
    setApplyStatus('writing');
    try {
      const response = await fetch('/api/nyx/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content: code }),
      });
      if (response.ok) {
        setApplyStatus('success');
        toast.success(`Successfully applied file to workspace: ${filePath}`);
        setTimeout(() => {
          setApplyStatus('idle');
          setShowApplyPanel(false);
        }, 2000);
      } else {
        const err = await response.json();
        throw new Error(err.error || 'Failed to write file');
      }
    } catch (e: any) {
      setApplyStatus('error');
      setErrorMsg(e.message);
      toast.error(`Failed to apply file: ${e.message}`);
    }
  };

  const handleRunCommand = async () => {
    setIsRunning(true);
    setShowTerminal(true);
    setTerminalOutput('Executing command on local terminal...\n');
    try {
      const response = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: code }),
      });
      const data = await response.json();
      let output = '';
      if (data.stdout) output += data.stdout;
      if (data.stderr) output += `\nError Output:\n${data.stderr}`;
      if (data.error) output += `\nExecution Error:\n${data.error}`;
      setTerminalOutput(output || 'Command executed with no output.');
    } catch (e: any) {
      setTerminalOutput(`Failed to execute command: ${e.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const lang = language || 'text';
  const isExecutable = ['bash', 'shell', 'sh', 'zsh', 'powershell', 'cmd', 'bat'].includes(lang.toLowerCase());
  const canApply = !isExecutable && lang !== 'text';

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-white/[0.08] shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary/60 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal size={10} className="text-primary/50" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">{lang}</span>
        </div>
        <div className="flex items-center gap-2">
          {isExecutable && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={handleRunCommand}
              disabled={isRunning}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all text-[8px] font-black uppercase tracking-widest disabled:opacity-50 shadow-sm"
            >
              <Play size={9} />
              <span>{isRunning ? 'Running' : 'Run'}</span>
            </motion.button>
          )}
          {canApply && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowApplyPanel(!showApplyPanel)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 hover:border-blue-500/30 text-blue-400 hover:text-blue-300 transition-all text-[8px] font-black uppercase tracking-widest shadow-sm"
            >
              <Save size={9} />
              <span>Apply</span>
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/4 hover:bg-white/6 border border-white/8 hover:border-primary/25 text-muted-foreground/50 hover:text-primary transition-all text-[8px] font-black uppercase tracking-widest shadow-sm"
          >
            {copied ? (
              <><Check size={9} className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
            ) : (
              <><Copy size={9} /><span>Copy</span></>
            )}
          </motion.button>
        </div>
      </div>

      {/* Apply File Panel */}
      <AnimatePresence>
        {showApplyPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-secondary/90 border-b border-border px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <FileText size={12} className="text-blue-400" />
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Save to Workspace:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="e.g., src/components/Button.tsx"
                className="flex-1 px-3 py-1.5 rounded bg-muted/30 border border-border text-xs text-foreground placeholder-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-colors font-mono"
              />
              <button
                onClick={handleApplyFile}
                disabled={applyStatus === 'writing'}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 shrink-0"
              >
                {applyStatus === 'writing' ? 'Writing...' : 'Write File'}
              </button>
              <button
                onClick={() => setShowApplyPanel(false)}
                className="p-1.5 rounded hover:bg-white/5 text-muted-foreground transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            {applyStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1">
                <CheckCircle2 size={12} />
                <span>Successfully wrote file to workspace!</span>
              </div>
            )}
            {applyStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
                <AlertCircle size={12} />
                <span>Error: {errorMsg}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal Output Panel */}
      <AnimatePresence>
        {showTerminal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-black border-b border-white/[0.04]"
          >
            <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-white/5">
              <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                <Terminal size={10} className="text-zinc-500" />
                <span>Local Terminal Output</span>
              </div>
              <button
                onClick={() => setShowTerminal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
              >
                <X size={12} />
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono leading-relaxed text-zinc-300 overflow-x-auto max-h-60 bg-black whitespace-pre-wrap">
              {terminalOutput}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code */}
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        showLineNumbers
        lineNumberStyle={{ color: 'rgba(255,255,255,0.12)', fontSize: '10px', userSelect: 'none', minWidth: '2.5em', paddingRight: '1em' }}
        customStyle={{ margin: 0, padding: '1rem 1.25rem', background: 'var(--card)', fontSize: '12px', lineHeight: '1.65', borderRadius: 0, fontFamily: '"Geist Mono","Fira Code","Cascadia Code",ui-monospace,monospace' }}
        codeTagProps={{ style: { fontFamily: '"Geist Mono","Fira Code","Cascadia Code",ui-monospace,monospace' } }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

// Interface definition
interface MessageListProps {
  history: ChatMessage[];
  activeAgent: 'nyx';
  isLoading: boolean;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Markdown Renderer (for assistant messages)
 * ───────────────────────────────────────────────────────────────────────────── */

const MarkdownContent: React.FC<{ content: string; isStreaming?: boolean }> = ({ content, isStreaming = false }) => (
  <div className="prose-nyx w-full">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isBlock = !!match || (typeof children === 'string' && (children as string).includes('\n'));
          if (isBlock) {
            return <CodeBlock language={match ? match[1] : 'text'} code={String(children).replace(/\n$/, '')} />;
          }
          return (
            <code className="px-1.5 py-0.5 rounded-md bg-primary/8 border border-primary/15 text-primary text-[11px] font-mono font-semibold" {...props}>
              {children}
            </code>
          );
        },
        h1: ({ children }) => <h1 className="text-base font-black tracking-tight text-foreground mt-5 mb-2 pb-2 border-b border-white/10">{children}</h1>,
        h2: ({ children }) => (
          <h2 className="text-[13px] font-black tracking-tight text-foreground mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary inline-block shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => <h3 className="text-[12px] font-bold tracking-tight text-foreground/90 mt-3 mb-1.5">{children}</h3>,
        h4: ({ children }) => <h4 className="text-[11px] font-bold tracking-tight text-foreground/80 mt-2 mb-1">{children}</h4>,
        p: ({ children }) => <p className="text-sm leading-[1.8] text-foreground/80 my-1.5">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-6 space-y-1 my-2 text-sm text-foreground/75">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1 my-2 text-sm text-foreground/75">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic text-primary/75">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 pl-3 py-1 border-l-2 border-primary/40 bg-primary/4 rounded-r-lg text-sm text-foreground/65 italic">
            {children}
          </blockquote>
        ),
        hr: () => <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-[11px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-primary/8 text-primary border-b border-white/8">{children}</thead>,
        th: ({ children }) => <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-[9px]">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 border-t border-white/4 text-foreground/75">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/75 transition-colors">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    {isStreaming && (
      <span className="inline-block w-[3px] h-3.5 ml-0.5 bg-primary/50 animate-pulse align-middle rounded-sm" />
    )}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
 * Empty State
 * ───────────────────────────────────────────────────────────────────────────── */

const EmptyState: React.FC<{
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
}> = ({ suggestedPrompts = [], onSuggestedPromptClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
    className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6 gap-6 relative overflow-hidden"
  >
    {/* Background warm aesthetic glow */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-primary/5 dark:bg-primary/8 rounded-full blur-[80px] pointer-events-none select-none -z-10 animate-pulse" />

    {/* Elegant bird logo with entrance and floating animations split to prevent Lottie measurement glitch */}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.6 }}
      className="relative cursor-default flex items-center justify-center"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative flex items-center justify-center transform-gpu"
      >
        {/* Premium static hardware-accelerated logo glow */}
        <div className="absolute w-24 h-24 bg-primary/20 dark:bg-primary/30 rounded-full blur-[45px] pointer-events-none select-none transform-gpu" />

        <Logo size={90} className="relative z-10 hover:scale-105 transition-transform duration-300 transform-gpu cursor-default" />
      </motion.div>
    </motion.div>

    {/* Typography Hierarchy */}
    <div className="space-y-2 max-w-sm">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-[20px] font-black tracking-tight text-foreground/80 leading-tight"
      >
        How can <span className="text-primary font-black">NYX</span> assist your project today?
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-[10px] uppercase tracking-widest font-black text-muted-foreground/45 leading-relaxed"
      >
        Native Local Intelligence & Cloud Orchestration
      </motion.p>
    </div>

    {/* Suggested Prompts Grid */}
    {suggestedPrompts && suggestedPrompts.length > 0 && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full mt-4"
      >
        {suggestedPrompts.slice(0, 4).map((p, idx) => (
          <motion.button
            key={idx}
            whileHover={{ scale: 1.01, backgroundColor: 'rgba(34, 211, 238, 0.06)', borderColor: 'rgba(34, 211, 238, 0.2)' }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSuggestedPromptClick?.(p)}
            className="p-3.5 text-[11px] font-bold text-left rounded-xl bg-card/45 border border-border/40 text-foreground/75 hover:text-primary transition-all duration-200 cursor-pointer flex items-center justify-between shadow-sm"
          >
            <span>{p}</span>
            <span className="text-[10px] text-primary/40 font-extrabold ml-2">➔</span>
          </motion.button>
        ))}
      </motion.div>
    )}
  </motion.div>
);

/* ─────────────────────────────────────────────────────────────────────────────
 * Main Message List
 * ───────────────────────────────────────────────────────────────────────────── */

export const MessageList: React.FC<MessageListProps> = ({
  history,
  activeAgent,
  isLoading,
  onCopy,
  copiedId,
  suggestedPrompts,
  onSuggestedPromptClick,
}) => {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      requestAnimationFrame(() => {
        if (consoleRef.current && autoScroll) {
          consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
      });
    }
  }, [history, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!consoleRef.current) return;
    requestAnimationFrame(() => {
      if (!consoleRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
      setShowJumpToBottom(!isAtBottom && history.length > 0);
    });
  }, [history.length]);

  const jumpToBottom = useCallback(() => {
    if (consoleRef.current) {
      requestAnimationFrame(() => {
        if (consoleRef.current) {
          consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
          setAutoScroll(true);
        }
      });
    }
  }, []);

  return (
    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden bg-background">
      <div
        ref={consoleRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative"
      >
        {history.length === 0 ? (
          <EmptyState suggestedPrompts={suggestedPrompts} onSuggestedPromptClick={onSuggestedPromptClick} />
        ) : (
          <div className="w-full max-w-3xl mx-auto px-4 pb-6 pt-4 space-y-1">
            {history.map((msg, i) => {
              const isUser = msg.role === 'user';
              const isStreaming = msg.status === 'loading';

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-3 group`}
                >
                  {isUser ? (
                    /* ── User bubble: right-aligned glassmorphic pill ── */
                    <div className={`
                      max-w-[85%] sm:max-w-[75%] py-2.5 px-4 rounded-2xl rounded-tr-sm
                      text-[13px] leading-[1.7] font-semibold
                      bg-secondary/85 backdrop-blur-md
                      border border-border
                      text-foreground/90 shadow-sm
                      ${activeAgent === 'nyx' ? 'border-primary/20 shadow-primary/5' : ''}
                    `}>
                      {msg.content}
                    </div>
                  ) : (
                    /* ── Assistant: container-less, direct on canvas ── */
                    <div className="flex-1 min-w-0">
                      {msg.status === 'error' ? (
                        <p className="text-sm text-red-400/90 py-1">{msg.content}</p>
                      ) : msg.content ? (
                        <>
                          <MarkdownContent content={msg.content} isStreaming={isStreaming} />

                          {/* Footer: metrics + copy — fades in on hover */}
                          {!isStreaming && msg.content && (
                            <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => onCopy(msg.content, `msg-${i}`)}
                                className="flex items-center gap-1 text-[9px] text-muted-foreground/40 hover:text-foreground/60 transition-colors"
                              >
                                {copiedId === `msg-${i}` ? (
                                  <><Check size={9} className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                                ) : (
                                  <><Copy size={9} /><span>Copy</span></>
                                )}
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Streaming skeleton */
                        <div className="flex items-center gap-1.5 py-1">
                          <div className="flex gap-1">
                            {[0, 1, 2].map(n => (
                              <motion.div
                                key={n}
                                className="w-1.5 h-1.5 rounded-full bg-primary/40"
                                animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1, 0.8] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay: n * 0.2 }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
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
            className="absolute bottom-1 right-6 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card/90 border border-border text-foreground/70 hover:text-foreground shadow-xl text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-all hover:bg-muted/90"
          >
            <ArrowDown className="w-3 h-3" />
            Latest
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
