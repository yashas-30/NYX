import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { ArrowRight, Sun, Moon, ChevronDown, Cpu, Zap, Shield, Database, Globe, Brain } from 'lucide-react';
import { UI_TEXT } from '../lib/design-system/copy';
import { THEME } from '../lib/design-system/theme';
import { Logo } from '../lib/design-system/icons';
import { useTheme } from '../context/ThemeContext';
import { Tooltip } from './Tooltip';
import { FeaturesGrid } from './landing/FeaturesGrid';
import { LiveTerminal } from './landing/LiveTerminal';
import { ErrorBoundary } from './ErrorBoundary';
import { WebGLShader } from './landing/WebGLShader';
import { AVAILABLE_MODELS } from '../config/models';

const REAL_SHOWCASE_MODELS = [
  { id: 'opencode/big-pickle', name: 'Big Pickle', provider: 'OpenCode Zen', type: 'STEALTH', spec: '200K Context / 2026' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Gemini Direct', type: 'MULTIMODAL', spec: '1M Context / 2025' },
  { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'OpenRouter', type: 'TEXT', spec: '200K Context / Latest' },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', name: 'Llama 3.3 Nemotron Super 49B', provider: 'NVIDIA NIM', type: 'TEXT', spec: '128K Context / Free' },
  { id: 'opencode/ring-2.6-1t-free', name: 'Ring 2.6 1T', provider: 'OpenCode Zen', type: 'REASONING', spec: '200K Context / Free' }
];

interface LandingPageProps {
  onStart: () => void;
}

const MarqueeItem = ({ icon: Icon, text }: { icon: any, text: string }) => (
  <div className="flex items-center gap-4 px-12 py-4 opacity-25 hover:opacity-90 hover:text-primary transition-[filter,opacity,color] duration-500 cursor-default">
    <Icon size={24} strokeWidth={1.5} className="text-foreground" />
    <span className="font-mono text-sm uppercase tracking-[0.2em] font-bold text-foreground">{text}</span>
  </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const [isHovering, setIsHovering] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    }
  };

  const textVariants: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.19, 1, 0.22, 1]
      }
    }
  };

  return (
    <main className="relative w-full min-h-screen bg-transparent flex flex-col font-sans scroll-smooth overflow-y-auto">
      {/* WebGL Shader Background */}
      <div className="fixed inset-0 z-0">
        <WebGLShader />
      </div>
      
      {/* Content wrapper with proper z-index */}
      <div className="relative z-10 w-full">



      <div className="fixed top-10 left-10 z-[200] flex items-center gap-4 group pointer-events-none">
        <div className="relative">
          <motion.div
            animate={{ 
              boxShadow: [
                "0 0 20px 0px rgba(var(--primary-rgb), 0)",
                "0 0 30px 4px rgba(var(--primary-rgb), 0.3)",
                "0 0 20px 0px rgba(var(--primary-rgb), 0)"
              ]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-12 h-12 rounded-[24px] bg-card/30 border border-border-strong flex items-center justify-center shadow-xl relative z-10 backdrop-blur-md"
          >
            <Logo size={36} className="" />
          </motion.div>
          {/* Subtle Outer Glow Layer */}
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
          />
        </div>
        <div className="flex flex-col -gap-1">
          <span className="font-black tracking-[-0.05em] text-foreground text-2xl leading-none">NYX</span>
          <span className="text-[9px] font-bold text-primary tracking-[0.3em] uppercase opacity-80">Pro Engine</span>
        </div>
      </div>

      {/* Aether Mesh Background - Reduced to let WebGL shader show */}
      <div className="fixed inset-0 opacity-10 pointer-events-none bg-mesh" />
      <div className="fixed inset-0 noise-overlay opacity-5 pointer-events-none" />

      {/* Hero Section - Attention */}
      <section className="relative w-full flex flex-col items-center justify-center pt-24 pb-12 px-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="w-full max-w-7xl flex flex-col items-center text-center"
        >
          <div className="mb-8">
            <h1
              className="text-4xl sm:text-6xl lg:text-7xl font-black text-foreground tracking-[-0.08em] leading-[0.9] mb-8"
              style={{ fontFamily: 'Geist, sans-serif' }}
            >
              The Science <br />
              <span className="text-primary italic">of Inference.</span>
            </h1>
          </div>

          <motion.p
            variants={textVariants}
            className="text-foreground/60 font-medium text-base md:text-lg max-w-2xl mb-12 leading-relaxed tracking-tight"
          >
            {UI_TEXT.landing.subtitle}
          </motion.p>

          <motion.div variants={textVariants} className="flex flex-col items-center gap-8">
            <button
              onClick={onStart}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              className="group relative px-12 py-5 bg-primary text-white font-black uppercase tracking-[0.4em] text-[11px] rounded-full overflow-hidden transition-all shadow-[0_20px_40px_-10px_rgba(var(--primary-rgb),0.4)] hover:shadow-[0_25px_50px_-12px_rgba(var(--primary-rgb),0.5)] active:scale-95"
            >
              <span className="relative z-10 flex items-center gap-6 text-white">
                LAUNCH NYX
                <motion.div animate={isHovering ? { x: 6 } : { x: 0 }}>
                  <ArrowRight size={18} strokeWidth={3} />
                </motion.div>
              </span>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="flex items-center gap-4 text-primary font-black uppercase tracking-[0.5em] text-[9px]"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              Explore Capabilities Below
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-6 flex flex-col items-center gap-2 text-foreground/40"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown size={20} />
          </motion.div>
        </motion.div>
      </section>

      {/* Marquee - Model Providers (Now under Hero as Instant Integrations Proof) */}
      <div className="w-full py-6 border-y border-white/15 dark:border-white/5 bg-white/10 dark:bg-white/5 backdrop-blur-xl overflow-hidden whitespace-nowrap flex relative">
        <div className="flex animate-scroll-x">
          <MarqueeItem icon={Globe} text="OpenRouter" />
          <MarqueeItem icon={Brain} text="Google Gemini" />
          <MarqueeItem icon={Zap} text="NVIDIA NIM" />
          <MarqueeItem icon={Database} text="Meta Llama" />
          <MarqueeItem icon={Cpu} text="Ollama Local" />
          <MarqueeItem icon={Shield} text="Anthropic" />
          {/* Duplicate for infinite loop */}
          <MarqueeItem icon={Globe} text="OpenRouter" />
          <MarqueeItem icon={Brain} text="Google Gemini" />
          <MarqueeItem icon={Zap} text="NVIDIA NIM" />
          <MarqueeItem icon={Database} text="Meta Llama" />
          <MarqueeItem icon={Cpu} text="Ollama Local" />
          <MarqueeItem icon={Shield} text="Anthropic" />
        </div>
      </div>

      {/* Features Grid Section - Interest */}
      <div id="features" className="bg-transparent relative">
        <ErrorBoundary>
          <FeaturesGrid />
        </ErrorBoundary>
      </div>

      {/* Live System Trace (Visual Realtime proof following capabilities) */}
      <ErrorBoundary>
        <LiveTerminal />
      </ErrorBoundary>

      {/* Product Showcase - Simulated Screenshots */}
      <section className="py-24 px-6 bg-transparent relative overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-4">Built for <br /><span className="text-primary italic">Intelligence.</span></h2>
            <p className="text-muted-foreground font-medium text-sm max-w-xl mx-auto">Providing the infrastructure to benchmark, optimize, and deploy at scale.</p>
          </div>

          <div className="flex flex-col gap-16 w-full">
            {/* Screenshot 1: Arena */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group glass rounded-[24px] overflow-hidden bg-white/30 dark:bg-zinc-900/30 backdrop-blur-md border border-border-strong shadow-xl max-w-5xl mx-auto w-full hover:-translate-y-1 hover:shadow-2xl transition-all duration-500"
            >
              <div className="p-8 border-b border-border-strong bg-muted/5">
                <span className="text-[11px] font-bold text-primary uppercase tracking-[0.4em] mb-2 block">Benchmark Engine</span>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-1">Model Arena</h3>
                <p className="text-sm text-muted-foreground">Compare performance and reasoning side-by-side.</p>
              </div>
              <div className="aspect-[21/9] bg-surface-deep relative p-8 group-hover:scale-[1.01] transition-transform duration-700">
                <div className="w-full h-full glass rounded-[24px] border border-border-strong flex flex-col p-6 gap-6 overflow-hidden shadow-2xl backdrop-blur-3xl">
                  <div className="flex justify-between items-center pb-3 border-b border-border-strong/5">
                    <div className="flex gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500/20" /><div className="w-2.5 h-2.5 rounded-full bg-amber-500/20" /><div className="w-2.5 h-2.5 rounded-full bg-green-500/20" /></div>
                    <div className="text-[9px] font-bold tracking-[0.3em] opacity-30">STUDIO / v4.2</div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 flex-1">
                    <div className="glass border-primary/10 rounded-[16px] p-5 flex flex-col gap-3">
                      <div className="flex justify-between text-[9px] font-bold tracking-widest opacity-40"><span>GEMINI_2.5_FLASH</span><span>24ms</span></div>
                      <div className="w-full h-1.5 bg-primary/10 rounded-full overflow-hidden"><motion.div animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2, repeat: Infinity }} className="w-1/2 h-full bg-primary/40" /></div>
                      <div className="space-y-2 mt-2"><div className="h-1 bg-muted rounded-full w-full opacity-20" /><div className="h-1 bg-muted rounded-full w-4/5 opacity-20" /><div className="h-1 bg-muted rounded-full w-full opacity-20" /></div>
                    </div>
                    <div className="glass border-accent/10 rounded-[16px] p-5 flex flex-col gap-3">
                      <div className="flex justify-between text-[9px] font-bold tracking-widest opacity-40 text-accent"><span>CLAUDE_SONNET_4</span><span>18ms</span></div>
                      <div className="w-full h-1.5 bg-accent/10 rounded-full overflow-hidden"><motion.div animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2.5, repeat: Infinity }} className="w-1/3 h-full bg-accent/40" /></div>
                      <div className="space-y-2 mt-2"><div className="h-1 bg-muted rounded-full w-full opacity-20" /><div className="h-1 bg-muted rounded-full w-full opacity-20" /><div className="h-1 bg-muted rounded-full w-2/3 opacity-20" /></div>
                    </div>
                  </div>
                  <div className="h-12 bg-foreground/5 rounded-full border border-border-strong flex items-center px-5 justify-between">
                    <div className="text-[9px] font-bold opacity-30 italic tracking-widest">Awaiting prompt submission...</div>
                    <div className="px-5 py-1.5 rounded-full bg-primary text-background text-[9px] font-bold tracking-widest shadow-lg shadow-primary/20">SEND_PROMPT</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Screenshot 3: Registry */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group glass rounded-[24px] overflow-hidden bg-white/30 dark:bg-zinc-900/30 backdrop-blur-md border border-border-strong shadow-xl max-w-5xl mx-auto w-full hover:-translate-y-1 hover:shadow-2xl transition-all duration-500"
            >
              <div className="p-8 border-b border-border-strong bg-muted/5">
                <span className="text-[11px] font-bold text-primary uppercase tracking-[0.4em] mb-2 block">{UI_TEXT.registry.title}</span>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-1">Model Providers</h3>
                <p className="text-sm text-muted-foreground">Manage your connections across cloud and local engines.</p>
              </div>
              <div className="bg-surface-deep relative p-6 group-hover:scale-[1.01] transition-transform duration-700">
                <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
                  {REAL_SHOWCASE_MODELS.map((m, i) => (
                    <div key={m.id} className="glass p-4 rounded-[16px] border-2 border-border-strong flex items-center justify-between hover:bg-foreground/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-foreground/5 border-2 border-border-strong flex items-center justify-center"><Globe size={16} className="opacity-40" /></div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold">{m.name}</span>
                          <span className="text-[8px] uppercase tracking-widest opacity-35 font-bold">{m.provider} • {m.type} • {m.spec}</span>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="px-3 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[7px] flex items-center justify-center font-black text-green-500 uppercase tracking-widest">Active</div>
                        <div className="w-6 h-6 rounded-full bg-foreground/5 border-2 border-border-strong flex items-center justify-center"><ArrowRight size={12} className="opacity-20" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="w-full py-12 px-6 flex flex-col items-center gap-4 text-muted-foreground/30 border-t border-white/10 dark:border-white/5 bg-white/5 dark:bg-black/5 backdrop-blur-sm">
        <span className="text-[10px] font-bold uppercase tracking-[0.5em]">
          VER 4.2 — Built by Antigravity using Stitch
        </span>
      </footer>
      </div>
    </main>
  );
};



