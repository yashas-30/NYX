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

interface LandingPageProps {
  onStart: () => void;
}

const MarqueeItem = ({ icon: Icon, text }: { icon: any, text: string }) => (
  <div className="flex items-center gap-4 px-12 py-4 grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-[filter,opacity] duration-500 cursor-default">
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
        delayChildren: 0.3
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
    <main className="relative min-h-screen w-full bg-background flex flex-col font-sans scroll-smooth">
      {/* Fixed Navigation */}
      <nav className="fixed top-8 right-8 z-[200]">
        <div className="glass px-8 py-3 rounded-full flex items-center gap-8 border border-border-strong shadow-xl backdrop-blur-3xl">
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all active:scale-90"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={20} strokeWidth={2.5} /> : <Moon size={20} strokeWidth={2.5} />}
          </button>
        </div>
      </nav>

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
            className="w-12 h-12 rounded-[24px] bg-foreground flex items-center justify-center shadow-xl relative z-10"
          >
            <Logo size={28} className="text-background" />
          </motion.div>
          {/* Subtle Outer Glow Layer */}
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-primary/20 blur-xl rounded-full"
          />
        </div>
        <div className="flex flex-col -gap-1">
          <span className="font-black tracking-[-0.05em] text-foreground text-2xl leading-none">LLM LAB</span>
          <span className="text-[9px] font-bold text-primary tracking-[0.3em] uppercase opacity-80">Pro Engine</span>
        </div>
      </div>

      {/* Aether Mesh Background */}
      <div className="fixed inset-0 opacity-40 pointer-events-none bg-mesh" />
      <div className="fixed inset-0 noise-overlay opacity-20 pointer-events-none" />

      {/* Hero Section - Attention */}
      <section className="relative min-h-screen w-full flex flex-col items-center justify-center pt-32 pb-24 px-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="w-full max-w-7xl flex flex-col items-center text-center"
        >
          <motion.div variants={textVariants} className="mb-12">
            <h1
              className="text-7xl sm:text-9xl lg:text-[180px] font-black text-foreground tracking-[-0.08em] leading-[0.85] mb-16"
              style={{ fontFamily: 'Geist, sans-serif' }}
            >
              The Science <br />
              <span className="text-primary italic">of Inference.</span>
            </h1>
          </motion.div>

          <motion.p
            variants={textVariants}
            className="text-foreground/70 font-medium text-2xl md:text-3xl max-w-5xl mb-24 leading-tight tracking-tight"
          >
            {UI_TEXT.landing.subtitle}
          </motion.p>

          <motion.div variants={textVariants} className="flex flex-col items-center gap-12">
            <button
              onClick={onStart}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              className="group relative px-24 py-10 bg-primary text-white font-black uppercase tracking-[0.5em] text-[12px] rounded-full overflow-hidden transition-all shadow-[0_40px_80px_-20px_rgba(var(--primary-rgb),0.5)] active:scale-95"
            >
              <span className="relative z-10 flex items-center gap-12 text-white">
                LAUNCH LAB
                <motion.div animate={isHovering ? { x: 8 } : { x: 0 }}>
                  <ArrowRight size={24} strokeWidth={3} />
                </motion.div>
              </span>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="flex items-center gap-4 text-primary font-black uppercase tracking-[0.5em] text-[10px]"
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
          className="absolute bottom-12 flex flex-col items-center gap-4 text-foreground/40"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown size={24} />
          </motion.div>
        </motion.div>
      </section>

      {/* Features Grid Section - Interest (Moved Up) */}
      <div id="features" className="bg-background relative">
        <ErrorBoundary>
          <FeaturesGrid />
        </ErrorBoundary>
      </div>

      {/* Marquee - Model Providers */}
      <div className="w-full py-12 border-y-2 border-border-strong bg-background/30 backdrop-blur-sm overflow-hidden whitespace-nowrap flex relative">
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

      {/* Product Showcase - Simulated Screenshots */}
      <section className="py-48 px-6 bg-background relative overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">Built for <br /><span className="text-primary italic">Intelligence.</span></h2>
            <p className="text-muted-foreground font-medium max-w-2xl mx-auto">Providing the infrastructure to benchmark, optimize, and deploy at scale.</p>
          </div>

          <div className="flex flex-col gap-32 w-full">
            {/* Screenshot 1: Arena */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group glass rounded-[24px] overflow-hidden bg-card/50 border border-border-strong shadow-xl max-w-5xl mx-auto w-full"
            >
              <div className="p-10 border-b border-border-strong bg-muted/5">
                <span className="text-[11px] font-bold text-primary uppercase tracking-[0.4em] mb-4 block">Benchmark Engine</span>
                <h3 className="text-4xl font-black tracking-tight mb-2">Model Arena</h3>
                <p className="text-base text-muted-foreground">Compare performance and reasoning side-by-side.</p>
              </div>
              <div className="aspect-[21/9] bg-surface-deep relative p-8 group-hover:scale-[1.01] transition-transform duration-700">
                <div className="w-full h-full glass rounded-[24px] border border-border-strong flex flex-col p-8 gap-8 overflow-hidden shadow-2xl backdrop-blur-3xl">
                  <div className="flex justify-between items-center pb-4 border-b border-border-strong/5">
                    <div className="flex gap-2.5"><div className="w-3 h-3 rounded-full bg-red-500/20" /><div className="w-3 h-3 rounded-full bg-amber-500/20" /><div className="w-3 h-3 rounded-full bg-green-500/20" /></div>
                    <div className="text-[10px] font-bold tracking-[0.3em] opacity-30">STUDIO / v4.2</div>
                  </div>
                  <div className="grid grid-cols-2 gap-8 flex-1">
                    <div className="glass border-primary/10 rounded-[20px] p-6 flex flex-col gap-4">
                      <div className="flex justify-between text-[10px] font-bold tracking-widest opacity-40"><span>GEMINI_2.0</span><span>24ms</span></div>
                      <div className="w-full h-1.5 bg-primary/10 rounded-full overflow-hidden"><motion.div animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2, repeat: Infinity }} className="w-1/2 h-full bg-primary/40" /></div>
                      <div className="space-y-3 mt-4"><div className="h-1.5 bg-muted rounded-full w-full opacity-20" /><div className="h-1.5 bg-muted rounded-full w-4/5 opacity-20" /><div className="h-1.5 bg-muted rounded-full w-full opacity-20" /></div>
                    </div>
                    <div className="glass border-accent/10 rounded-[20px] p-6 flex flex-col gap-4">
                      <div className="flex justify-between text-[10px] font-bold tracking-widest opacity-40 text-accent"><span>CLAUDE_3.5</span><span>18ms</span></div>
                      <div className="w-full h-1.5 bg-accent/10 rounded-full overflow-hidden"><motion.div animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2.5, repeat: Infinity }} className="w-1/3 h-full bg-accent/40" /></div>
                      <div className="space-y-3 mt-4"><div className="h-1.5 bg-muted rounded-full w-full opacity-20" /><div className="h-1.5 bg-muted rounded-full w-full opacity-20" /><div className="h-1.5 bg-muted rounded-full w-2/3 opacity-20" /></div>
                    </div>
                  </div>
                  <div className="h-16 bg-foreground/5 rounded-full border border-border-strong flex items-center px-6 justify-between">
                    <div className="text-[10px] font-bold opacity-30 italic tracking-widest">Awaiting prompt submission...</div>
                    <div className="px-6 py-2 rounded-full bg-primary text-background text-[10px] font-bold tracking-widest shadow-lg shadow-primary/20">SEND_PROMPT</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Screenshot 3: Registry */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group glass rounded-[24px] overflow-hidden bg-card/50 border border-border-strong shadow-xl max-w-5xl mx-auto w-full"
            >
              <div className="p-10 border-b border-border-strong bg-muted/5">
                <span className="text-[11px] font-bold text-primary uppercase tracking-[0.4em] mb-4 block">{UI_TEXT.registry.title}</span>
                <h3 className="text-4xl font-black tracking-tight mb-2">Model Providers</h3>
                <p className="text-base text-muted-foreground">Manage your connections across cloud and local engines.</p>
              </div>
              <div className="aspect-[21/9] bg-surface-deep relative p-12 group-hover:scale-[1.01] transition-transform duration-700">
                <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
                  {['Google Gemini', 'Anthropic Claude', 'OpenRouter', 'NVIDIA NIM', 'Ollama Local'].map((p, i) => (
                    <div key={p} className="glass p-5 rounded-[24px] border-2 border-border-strong flex items-center justify-between hover:bg-foreground/5 transition-colors">
                      <div className="flex items-center gap-6">
                        <div className="w-10 h-10 rounded-xl bg-foreground/5 border-2 border-border-strong flex items-center justify-center"><Globe size={20} className="opacity-40" /></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{p}</span>
                          <span className="text-[9px] uppercase tracking-widest opacity-30 font-bold">API v2.0 / {i % 2 === 0 ? 'CLOUD' : 'EDGE'}</span>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="px-4 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[8px] flex items-center justify-center font-black text-green-500 uppercase tracking-widest">Active</div>
                        <div className="w-8 h-8 rounded-full bg-foreground/5 border-2 border-border-strong flex items-center justify-center"><ArrowRight size={14} className="opacity-20" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Live System Trace */}
      <ErrorBoundary>
        <LiveTerminal />
      </ErrorBoundary>

      <footer className="w-full py-12 px-6 flex flex-col items-center gap-4 text-muted-foreground/30 border-t-2 border-border-strong">
        <span className="text-[10px] font-bold uppercase tracking-[0.5em]">
          VER 4.2 — Built by Antigravity using Stitch
        </span>
      </footer>
    </main>
  );
};



