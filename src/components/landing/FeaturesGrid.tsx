import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Terminal, Activity, Shield, Key, Database, ArrowRight } from 'lucide-react';
import { UI_TEXT } from '../../lib/design-system/copy';
import { ArenaPreview, CoderPreview, MetricsPreview } from './AppPreview';

const FEATURE_TABS = [
  {
    id: 'compare',
    icon: Terminal,
    label: 'Autonomous',
    title: 'Coding Agents',
    desc: 'Deploy high-precision autonomous agents. Benchmark OpenCode vs Claude Code on complex refactoring tasks.',
    component: ArenaPreview,
    color: 'var(--primary)'
  },
  {
    id: 'speed',
    icon: Activity,
    label: 'Telemetry',
    title: 'Live Metrics',
    desc: 'Full transparency on performance. Track tokens per second, latency, and costs across every provider.',
    component: MetricsPreview,
    color: 'var(--primary)'
  }
];

export const FeaturesGrid: React.FC = () => {
  const [activeTab, setActiveTab] = useState(FEATURE_TABS[0]);

  return (
    <section id="features" className="w-full max-w-7xl mx-auto px-6 py-48">
      <div className="flex flex-col mb-24 max-w-2xl">
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="text-primary font-bold text-[11px] uppercase tracking-[0.5em] mb-4"
        >
          Capabilities
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl md:text-8xl font-black text-foreground tracking-tighter leading-[0.85]"
          style={{ fontFamily: 'Geist, sans-serif' }}
        >
          Built for <br />
          <span className="opacity-20 italic">Total Clarity.</span>
        </motion.h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
        {/* Navigation Tabs */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {FEATURE_TABS.map((tab) => {
            const isActive = activeTab.id === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab)}
                className={`group relative text-left p-8 rounded-[24px] transition-all duration-500 overflow-hidden ${isActive ? 'bg-primary/10 border-primary/10 border shadow-2xl' : 'hover:bg-foreground/5'
                  }`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-2.5 rounded-full transition-colors ${isActive ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'bg-muted-zinc/10 text-muted-foreground group-hover:text-foreground'}`}>
                    <Icon size={20} />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                    {tab.label}
                  </span>
                </div>

                <h3 className={`text-2xl font-bold mb-3 transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {tab.title}
                </h3>
                <p className={`text-[15px] leading-relaxed transition-colors ${isActive ? 'text-foreground/70' : 'text-foreground/40'}`}>
                  {tab.desc}
                </p>

                {isActive && (
                  <motion.div 
                    layoutId="tab-active-glow"
                    className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(var(--primary-rgb),0.1),transparent_50%)]"
                  />
                )}
              </button>
            );
          })}


        </div>

        {/* Live Preview Container */}
        <div className="lg:col-span-8 sticky top-32">
          <div className="relative aspect-[16/10] w-full rounded-[24px] overflow-hidden glass border border-border-strong shadow-[0_40px_80px_-20px_rgba(0,0,0,0.3)] bg-surface-deep backdrop-blur-3xl">
            {/* Window Chrome */}
            <div className="absolute top-0 inset-x-0 h-14 border-b border-border-strong flex items-center px-8 justify-between bg-background/40 backdrop-blur-3xl z-20">
              <div className="flex gap-2.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/10" />
                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/10" />
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/10" />
              </div>
              <div className="text-[10px] font-bold tracking-[0.3em] text-foreground/40 uppercase">
                LLMLAB 2026 / {activeTab.title}
              </div>
              <div className="w-16 h-1 bg-muted-zinc/10 rounded-full" />
            </div>

            {/* Content Switcher */}
            <div className="absolute inset-0 pt-14">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab.id}
                  initial={{ opacity: 0, scale: 0.96, filter: 'blur(20px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.04, filter: 'blur(20px)' }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full h-full"
                >
                  <activeTab.component />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Accent Corner Glow */}
            <div
              className="absolute -bottom-32 -right-32 w-96 h-96 blur-[120px] transition-colors duration-1000 pointer-events-none"
              style={{ backgroundColor: activeTab.color, opacity: 0.1 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
