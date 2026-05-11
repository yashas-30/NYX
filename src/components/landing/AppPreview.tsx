import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Cpu, Zap, Activity, MessageSquare, ChevronRight, LayoutGrid } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

// Mock data for the metrics preview
const MOCK_METRICS = Array.from({ length: 20 }, (_, i) => ({
  time: i,
  latency: Math.floor(Math.random() * 400) + 200,
  tokens: Math.floor(Math.random() * 80) + 20,
}));

const TypewriterText = ({ text, delay = 0 }: { text: string, delay?: number }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayedText(text.slice(0, i));
        i++;
        if (i > text.length) clearInterval(interval);
      }, 30);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay]);

  return <span className="whitespace-pre-wrap">{displayedText}</span>;
};

export const ArenaPreview = () => {
  const [step, setStep] = useState(0); // 0: idle, 1: typing, 2: opencode, 3: switching, 4: claudecode
  const [prompt, setPrompt] = useState('');
  const fullPrompt = "Refactor auth middleware to use JWT...";

  useEffect(() => {
    const timer = setTimeout(() => {
      // Step 1: Start typing
      setStep(1);
      let i = 0;
      const typeInterval = setInterval(() => {
        setPrompt(fullPrompt.slice(0, i));
        i++;
        if (i > fullPrompt.length) {
          clearInterval(typeInterval);
          setTimeout(() => setStep(2), 800); // Step 2: OpenCode
        }
      }, 50);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => setStep(3), 3000); // Step 3: Switching
    }
    if (step === 3) {
      setTimeout(() => setStep(4), 1000); // Step 4: Claude Code
    }
  }, [step]);

  return (
    <div className="w-full h-full p-8 flex flex-col gap-6 font-mono text-[11px]">
      <div className="flex gap-6 h-full relative">
        {/* OPENCODE */}
        <motion.div 
          animate={{ 
            opacity: step >= 2 && step < 4 ? 1 : 0.3,
            scale: step === 2 ? 1 : 0.98,
            filter: step === 2 ? 'blur(0px)' : 'blur(2px)'
          }}
          className={`flex-1 glass border-primary/10 rounded-[24px] p-5 flex flex-col gap-3 overflow-hidden shadow-xl ${step === 2 ? 'ring-2 ring-primary/20' : ''}`}
        >
          <div className="flex justify-between items-center opacity-40 mb-2">
            <span className="flex items-center gap-2 font-bold tracking-widest text-primary"><Cpu size={12} strokeWidth={2.5} /> OPENCODE</span>
            <span className="font-bold">STATUS: {step === 2 ? 'PROCESSING' : 'IDLE'}</span>
          </div>
          <div className="text-foreground/90 leading-relaxed text-xs">
            {step === 2 && (
              <TypewriterText text="> Analyzing auth.ts\n> Identified 3 legacy dependencies\n> Drafting JWT implementation plan..." delay={0} />
            )}
            {step > 2 && (
              <div className="opacity-40 italic">&gt; Analysis complete. Transitioning task...</div>
            )}
          </div>
          <div className="mt-auto pt-4 border-t border-border-strong flex justify-between items-center">
            <span className="text-primary font-bold tracking-widest uppercase">{step === 2 ? 'Planning' : 'Ready'}</span>
            <div className="flex gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${step === 2 ? 'bg-primary animate-pulse' : 'bg-primary/20'}`} />
            </div>
          </div>
        </motion.div>

        {/* CLAUDE CODE */}
        <motion.div 
          animate={{ 
            opacity: step === 4 ? 1 : 0.3,
            scale: step === 4 ? 1 : 0.98,
            filter: step === 4 ? 'blur(0px)' : 'blur(2px)'
          }}
          className={`flex-1 glass border-accent/10 rounded-[24px] p-5 flex flex-col gap-3 overflow-hidden bg-accent/5 shadow-xl ${step === 4 ? 'ring-2 ring-accent/20' : ''}`}
        >
          <div className="flex justify-between items-center opacity-40 mb-2">
            <span className="flex items-center gap-2 font-bold tracking-widest text-accent"><Zap size={12} strokeWidth={2.5} /> CLAUDE CODE</span>
            <span className="text-accent font-bold">STATUS: {step === 4 ? 'EXECUTING' : 'WAITING'}</span>
          </div>
          <div className="text-foreground/90 leading-relaxed text-xs">
            {step === 4 && (
              <TypewriterText text="> Received plan from OpenCode\n> Applying secure JWT middleware\n> Running regression tests...\n> Task Complete." delay={500} />
            )}
          </div>
          <div className="mt-auto pt-4 border-t border-border-strong flex justify-between items-center">
            <span className="text-accent font-bold tracking-widest uppercase">{step === 4 ? 'Executing' : 'Standby'}</span>
            <div className="flex gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${step === 4 ? 'bg-accent animate-pulse' : 'bg-accent/20'}`} />
            </div>
          </div>
        </motion.div>

        {/* Switching Overlay */}
        <AnimatePresence>
          {step === 3 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-background/20 backdrop-blur-sm pointer-events-none"
            >
              <div className="bg-primary px-4 py-2 rounded-full text-background font-bold tracking-widest text-[9px] uppercase shadow-2xl">
                Switching Context...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Simulation */}
      <div className="mt-auto glass border-border-strong rounded-full px-6 py-4 flex items-center gap-4 bg-foreground/[0.02]">
        <div className="w-2 h-2 rounded-full bg-primary/40" />
        <div className="flex-1 text-[13px] font-medium text-foreground/60 overflow-hidden whitespace-nowrap">
          {prompt}
          {step === 1 && <span className="w-1.5 h-4 bg-primary inline-block align-middle ml-1 animate-pulse" />}
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${step >= 2 ? 'bg-primary text-background' : 'bg-foreground/10 text-foreground/40'}`}>
          Send_Task
        </div>
      </div>
    </div>
  );
};

export const CoderPreview = () => (
  <div className="w-full h-full p-8 font-mono text-xs flex flex-col">
    <div className="flex items-center gap-3 mb-6 text-primary">
      <div className="p-1.5 bg-primary/10 rounded-full">
        <Terminal size={14} strokeWidth={2.5} />
      </div>
      <span className="uppercase tracking-[0.2em] font-bold">Agent Status / Active</span>
    </div>
    <div className="flex-1 space-y-3 overflow-hidden">
      <div className="flex gap-4 text-muted-foreground/40">
        <span className="font-bold">01</span>
        <span className="text-blue-400/80 font-bold tracking-widest">ANALYZING</span>
        <span className="text-muted-foreground/60 italic">Scanning workspace...</span>
      </div>
      <div className="flex gap-4 text-muted-foreground/40">
        <span className="font-bold">02</span>
        <span className="text-green-400/80 font-bold tracking-widest">PLANNING</span>
        <span className="text-muted-foreground/60 italic">Refactor telemetry.ts</span>
      </div>
      <div className="flex gap-4 text-muted-foreground/40">
        <span className="font-bold">03</span>
        <span className="text-primary font-bold tracking-widest">EXECUTING</span>
        <TypewriterText text="Applying high-precision diff to 4 lines..." delay={1000} />
      </div>
      <div className="mt-6 p-5 bg-primary/5 border border-primary/10 rounded-[20px] backdrop-blur-3xl">
        <pre className="text-primary/60 font-bold text-[11px] leading-relaxed">
          {`- const latency = Date.now() - start;
+ const latency = performance.now() - start;`}
        </pre>
      </div>
    </div>
  </div>
);

const AnimatedNumber = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let start = displayValue;
    const end = value;
    const duration = 2000;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutExpo = 1 - Math.pow(2, -10 * progress);
      const current = Math.floor(start + (end - start) * easeOutExpo);
      
      setDisplayValue(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);

  return <span>{displayValue.toLocaleString()}</span>;
};

export const MetricsPreview = () => {
  const [throughput, setThroughput] = useState(1242);
  const [metrics, setMetrics] = useState(MOCK_METRICS);

  useEffect(() => {
    const interval = setInterval(() => {
      setThroughput(prev => prev + Math.floor(Math.random() * 20) - 5);
      setMetrics(prev => {
        const next = [...prev.slice(1), {
          time: prev[prev.length - 1].time + 1,
          latency: Math.floor(Math.random() * 400) + 200,
          tokens: Math.floor(Math.random() * 80) + 20,
        }];
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full p-8 flex flex-col relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <div className="flex justify-between items-end mb-10 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/40 font-bold mb-2 block">Live Throughput</span>
          <h4 className="text-6xl font-black font-mono tracking-tighter text-foreground">
            <AnimatedNumber value={throughput} /> <span className="text-xs text-primary font-bold tracking-widest opacity-60">T/S</span>
          </h4>
        </motion.div>
        <div className="flex gap-3 mb-2 h-24 items-end">
          {[0.4, 0.7, 0.5, 1.0, 0.6].map((h, i) => (
            <motion.div 
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h * 100}%` }}
              transition={{ 
                duration: 2, 
                delay: i * 0.15,
                repeat: Infinity,
                repeatType: "reverse",
                ease: [0.4, 0, 0.2, 1]
              }}
              className={`w-3.5 rounded-full shadow-2xl transition-colors duration-500`}
              style={{ 
                backgroundColor: i === 3 ? 'var(--primary)' : 'rgba(var(--primary-rgb), 0.2)',
                boxShadow: i === 3 ? '0 0 30px rgba(var(--primary-rgb), 0.4)' : 'none'
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[180px] opacity-30 group relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metrics}>
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <Line 
              type="monotone" 
              dataKey="latency" 
              stroke="var(--primary)" 
              strokeWidth={4} 
              dot={false} 
              isAnimationActive={false}
              filter="url(#glow)"
            />
            <Line 
              type="monotone" 
              dataKey="tokens" 
              stroke="var(--accent)" 
              strokeWidth={2} 
              dot={false} 
              isAnimationActive={false}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Status Bar */}
      <div className="mt-8 pt-6 border-t border-border-strong flex justify-between items-center text-[9px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
          <span>Nodes: 12 Active</span>
        </div>
        <span>Buffer: Optimized</span>
      </div>
    </div>
  );
};
