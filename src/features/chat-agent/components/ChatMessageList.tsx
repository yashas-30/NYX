/**
 * @file src/features/chat-agent/components/ChatMessageList.tsx
 * @description Sleek, fluid message history scroll area for the Chat Agent.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, ArrowDown, Terminal, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ChatMessage } from '@src/infrastructure/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Logo, NyxLoader } from '@src/shared/design-system/icons';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CodeMirrorBlock } from '@src/shared/components/ui/CodeMirrorBlock';
import { toast } from '@src/shared/components/ui/sonner';

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const lang = language || 'text';

  return (
    <div className="relative group/code my-4 p-[1px] bg-white/[0.03] border border-white/[0.04] rounded-2xl shadow-xl text-left">
      <div className="rounded-[calc(1rem-1px)] overflow-hidden bg-[#111622] border border-white/[0.03]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#1B2336] border-b border-white/[0.03]">
          <div className="flex items-center gap-2">
            <Terminal size={10} className="text-[#22D3EE]" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400">{lang}</span>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/4 border border-white/5 text-muted-foreground/50 hover:text-foreground transition-all text-[8px] font-black uppercase tracking-widest shadow-sm cursor-pointer"
            >
              {copied ? (
                <><Check size={9} className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
              ) : (
                <><Copy size={9} /><span>Copy</span></>
              )}
            </motion.button>
          </div>
        </div>

        {/* CodeMirror Code Block */}
        <CodeMirrorBlock code={code} language={lang} />
      </div>
    </div>
  );
};

interface ChatMessageListProps {
  history: ChatMessage[];
  activeAgent: 'nyx';
  isLoading: boolean;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
  submitReward?: (id: string, reward: number) => void;
}

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
            <code className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[#22D3EE] text-[11px] font-mono font-semibold" {...props}>
              {children}
            </code>
          );
        },
        h1: ({ children }) => <h1 className="text-base font-black tracking-tight text-foreground mt-5 mb-2 pb-2 border-b border-white/10">{children}</h1>,
        h2: ({ children }) => (
          <h2 className="text-[13px] font-black tracking-tight text-foreground mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-[#22D3EE] inline-block shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => <h3 className="text-[12px] font-bold tracking-tight text-foreground/90 mt-3 mb-1.5">{children}</h3>,
        p: ({ children }) => <p className="text-sm leading-[1.8] text-foreground/80 my-1.5">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-6 space-y-1 my-2 text-sm text-foreground/75">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1 my-2 text-sm text-foreground/75">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic text-[#22D3EE]/80">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 pl-3 py-1 border-l-2 border-[#22D3EE]/45 bg-white/[0.01] rounded-r-lg text-sm text-foreground/65 italic">
            {children}
          </blockquote>
        ),
        hr: () => <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />,
      }}
    >
      {content}
    </ReactMarkdown>
    {isStreaming && (
      <span className="inline-block ml-1.5 align-middle shrink-0">
        <NyxLoader size={13} className="text-primary" />
      </span>
    )}
  </div>
);

const EmptyState: React.FC<{
  suggestedPrompts?: string[];
  onSuggestedPromptClick?: (prompt: string) => void;
}> = ({ suggestedPrompts = [], onSuggestedPromptClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6 gap-6 relative overflow-hidden"
  >
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-[#22D3EE]/[0.02] rounded-full blur-[90px] pointer-events-none select-none -z-10 animate-pulse" />
 
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
        <div className="absolute w-24 h-24 bg-[#22D3EE]/[0.08] rounded-full blur-[45px] pointer-events-none select-none transform-gpu" />
        <Logo size={90} className="relative z-10 hover:scale-105 transition-transform duration-300 transform-gpu cursor-default" />
      </motion.div>
    </motion.div>
 
    <div className="space-y-2 max-w-sm">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-[20px] font-black tracking-tight text-foreground/80 leading-tight"
      >
        Chat with <span className="font-black text-foreground">NY<span className="text-[#22D3EE]">X</span></span>
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
            whileHover={{ scale: 1.01, backgroundColor: 'rgba(34, 211, 238, 0.05)', borderColor: 'rgba(34, 211, 238, 0.2)' }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onSuggestedPromptClick?.(p)}
            className="p-4 text-[11px] font-bold text-left rounded-2xl bg-white/[0.01] border border-white/5 text-foreground/75 hover:text-[#22D3EE] transition-all duration-200 cursor-pointer flex items-center justify-between shadow-sm"
          >
            <span>{p}</span>
            <span className="text-[10px] text-[#22D3EE]/70 font-extrabold ml-2">➔</span>
          </motion.button>
        ))}
      </motion.div>
    )}
  </motion.div>
);

interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  activeAgent: 'nyx';
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  submitReward?: (id: string, reward: number) => void;
}

const MessageBubble = React.memo<MessageBubbleProps>(({
  msg,
  index,
  activeAgent,
  onCopy,
  copiedId,
  submitReward,
}) => {
  const isUser = msg.role === 'user';
  const isStreaming = msg.status === 'loading';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}
    >
      {isUser ? (
        <div className="max-w-[85%] sm:max-w-[75%] py-2 px-1 text-[13px] font-semibold leading-[1.75] text-zinc-200 select-text">
          {msg.content}
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          {msg.status === 'error' ? (
            <p className="text-sm text-red-400/90 py-1 font-semibold uppercase tracking-wide">
              {msg.content || 'Error: Generation failed. Please check your model settings or connection.'}
            </p>
          ) : msg.status === 'stopped' ? (
            <p className="text-sm text-zinc-500 py-1 italic">
              Generation stopped.
            </p>
          ) : msg.status === 'loading' && !msg.content ? (
            <div className="flex items-center gap-2.5 py-2 select-none">
              <NyxLoader size={14} className="text-primary shrink-0" />
              <span className="text-[10.5px] text-zinc-400 font-black uppercase tracking-[0.2em] leading-none">NYX is active...</span>
            </div>
          ) : msg.content ? (
            <>
              <MarkdownContent content={msg.content} isStreaming={isStreaming} />

              {!isStreaming && msg.content && (
                <div className="mt-3 flex items-center gap-3.5 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity duration-300">
                  <button
                    onClick={() => onCopy(msg.content, `msg-${index}`)}
                    className="flex items-center gap-1 text-[9px] text-muted-foreground/30 hover:text-[#22D3EE] transition-colors cursor-pointer uppercase font-black tracking-widest"
                  >
                    {copiedId === `msg-${index}` ? (
                      <><Check size={9} className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                    ) : (
                      <><Copy size={9} /><span>Copy Message</span></>
                    )}
                  </button>

                  {msg.rolloutId && submitReward && (
                    <div className="flex items-center gap-2 border-l border-white/5 pl-3.5">
                      <span className="text-[8.5px] text-zinc-600 font-bold uppercase tracking-wider select-none">Helpful?</span>
                      <button
                        onClick={() => {
                          submitReward(msg.rolloutId!, 1.0);
                          msg.reward = 1.0;
                          toast.success('Thank you for your feedback! Evolving optimizations in background.');
                        }}
                        className={`p-1 rounded text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer ${
                          msg.reward === 1.0 ? 'text-emerald-400' : ''
                        }`}
                        title="Yes, accurate and helpful (+1.0 reward)"
                      >
                        <ThumbsUp size={11} />
                      </button>
                      <button
                        onClick={() => {
                          submitReward(msg.rolloutId!, 0.0);
                          msg.reward = 0.0;
                          toast.error('Feedback logged. Running simulated background optimization pass...');
                        }}
                        className={`p-1 rounded text-zinc-500 hover:text-red-400 transition-colors cursor-pointer ${
                          msg.reward === 0.0 ? 'text-red-400' : ''
                        }`}
                        title="No, hallucinated or inaccurate (0.0 reward)"
                      >
                        <ThumbsDown size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-zinc-500 text-xs italic">Empty response from model.</div>
          )}
        </div>
      )}
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  history,
  activeAgent,
  isLoading,
  onCopy,
  copiedId,
  suggestedPrompts,
  onSuggestedPromptClick,
  submitReward,
}) => {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const rowVirtualizer = useVirtualizer({
    count: history.length,
    getScrollElement: () => consoleRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: useCallback((index: number) => {
      const msg = history[index];
      return msg ? `${msg.timestamp}-${index}` : index;
    }, [history]),
  });

  useEffect(() => {
    if (autoScroll && history.length > 0) {
      rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
    }
  }, [history, autoScroll, rowVirtualizer]);

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
    if (consoleRef.current && history.length > 0) {
      rowVirtualizer.scrollToIndex(history.length - 1, { align: 'end' });
      setAutoScroll(true);
    }
  }, [history.length, rowVirtualizer]);

  return (
    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden bg-background">
      <div
        ref={consoleRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative"
      >
        {history.length === 0 ? (
          isLoading ? (
            <div className="flex-1 flex items-center justify-center min-h-[65vh]">
              <NyxLoader size={45} className="text-zinc-500" />
            </div>
          ) : (
            <EmptyState suggestedPrompts={suggestedPrompts} onSuggestedPromptClick={onSuggestedPromptClick} />
          )
        ) : (
          <div 
            className="w-full max-w-3xl mx-auto px-4 pb-6 pt-4 relative"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const msg = history[virtualItem.index];
              if (!msg) return null;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 w-full"
                  style={{
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: '12px',
                  }}
                >
                  <MessageBubble
                    msg={msg}
                    index={virtualItem.index}
                    activeAgent={activeAgent}
                    onCopy={onCopy}
                    copiedId={copiedId}
                    submitReward={submitReward}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

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
