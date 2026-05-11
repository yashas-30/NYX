import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

const LOG_LINES = [
  { type: 'info', text: 'Initializing LLMLAB Engine v4.2...' },
  { type: 'info', text: 'Checking connection: Google Gemini Pro...' },
  { type: 'success', text: 'Gemini Pro connected successfully.' },
  { type: 'info', text: 'Checking connection: Anthropic Claude...' },
  { type: 'success', text: 'Claude connected successfully.' },
  { type: 'info', text: 'Detecting local AI instances...' },
  { type: 'success', text: 'Ollama instance active at port 11434' },
  { type: 'info', text: 'Optimizing performance buffers...' },
  { type: 'success', text: 'Telemetry pipelines initialized.' },
  { type: 'info', text: 'System ready for use.' },
];

const MAX_VISIBLE_LINES = 10; // Limit DOM nodes for performance

export const LiveTerminal = React.memo(function LiveTerminalComponent() {
  const [lines, setLines] = useState<typeof LOG_LINES>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Memoize visible lines to reduce re-renders
  const visibleLines = useMemo(() => {
    return lines.slice(-MAX_VISIBLE_LINES);
  }, [lines]);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < LOG_LINES.length) {
        const nextLine = LOG_LINES[i];
        if (nextLine) {
          setLines(prev => [...prev, nextLine]);
        }
        i++;
      } else {
        // Start heartbeat logs
        const heartbeat = {
          type: 'info',
          text: `SYSTEM HEARTBEAT [${Math.random().toString(16).slice(2, 10).toUpperCase()}] - ALL NODES OPERATIONAL`
        };
        // Keep only last MAX_VISIBLE_LINES to limit DOM size
        setLines(prev => [...prev.slice(-MAX_VISIBLE_LINES), heartbeat]);
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom - use requestAnimationFrame to avoid forced reflow
  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [lines]);

  // Track if user has scrolled up
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user scrolled up, don't auto-scroll
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  return (
    <section className="w-full bg-background border-y-2 border-border-strong py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-muted-foreground">System Initialization Trace</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 className="text-4xl font-black tracking-tighter text-foreground" style={{ fontFamily: 'Geist, sans-serif' }}>
              Built for <br /> <span className="text-primary italic">Performance.</span>
            </h3>
            <p className="text-muted-foreground font-medium leading-relaxed max-w-md">
              LLMLAB is a high-performance system that talks directly to AI providers. This means faster responses and zero overhead for your workflow.
            </p>
          </div>

          <div
            className="terminal-staging h-[300px] overflow-y-auto relative custom-scrollbar scroll-smooth"
            ref={containerRef}
            onScroll={handleScroll}
          >
            <div className="flex flex-col gap-1.5 pb-12">
              {visibleLines.map((line, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-4"
                >
                  <span className="opacity-40 text-foreground/40 font-mono text-[10px]">[{new Date().toLocaleTimeString()}]</span>
                  <span className={
                    line?.type === 'success' ? 'text-primary' :
                      line?.type === 'warning' ? 'text-amber-500' :
                        'text-foreground/80'
                  }>
                    {line?.text || '...'}
                  </span>
                </motion.div>
              ))}
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="inline-block w-1.5 h-3.5 bg-primary mt-1"
              />
            </div>
            {/* Gradient Overlay */}
            <div className="sticky bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none -mt-12" />
          </div>
        </div>
      </div>
    </section>
  );
});

LiveTerminal.displayName = 'LiveTerminal';

