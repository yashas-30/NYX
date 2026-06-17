import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown, Globe, PuzzlePiece, Code, FileText, Microscope, Sparkle, Brain, Link, Lightning, ArrowsClockwise, ClipboardText } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';

function getIconFromEmoji(key: string, className = "w-3.5 h-3.5") {
  switch (key) {
    case 'brain': return <Brain className={className} />;
    case 'sparkle': return <Sparkle className={className} />;
    case 'link': return <Link className={className} />;
    case 'lightning': return <Lightning className={className} />;
    case 'arrows_clockwise': return <ArrowsClockwise className={className} />;
    case 'globe': return <Globe className={className} />;
    case 'puzzle_piece': return <PuzzlePiece className={className} />;
    case 'code': return <Code className={className} />;
    case 'file_text': return <FileText className={className} />;
    case 'microscope': return <Microscope className={className} />;
    case 'clipboard_text': return <ClipboardText className={className} />;
    default: return null;
  }
}
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useNyxStore } from '@src/shared/store/useNyxStore';

interface ThinkingBlockProps {
  content: string;
  responseContent?: string;
  isComplete?: boolean;
  startedAt?: number;
  agentProgress?: {
    step: number;
    total: number;
    currentAgent?: string;
    elapsed?: number;
  };
}

// ─── Phase detection ───────────────────────────────────────────────────────────
type ThinkingPhase = 'analyzing' | 'tool_evaluating' | 'synthesizing' | 'complete';

function detectPhase(content: string): ThinkingPhase {
  if (!content || content.length < 10) return 'analyzing';
  // Only process the last 1500 chars to avoid main thread blocking on huge strings
  const scanArea = content.length > 2000 ? content.slice(-1500) : content;
  const lower = scanArea.toLowerCase();
  
  const toolIdx = Math.max(
    lower.lastIndexOf('tool'),
    lower.lastIndexOf('function'),
    lower.lastIndexOf('search'),
    lower.lastIndexOf('calling')
  );
  
  const synthIdx = Math.max(
    lower.lastIndexOf('therefore'),
    lower.lastIndexOf('in conclusion'),
    lower.lastIndexOf('based on'),
    lower.lastIndexOf('the answer'),
    lower.lastIndexOf('finally'),
    lower.lastIndexOf('crafting'),
    lower.lastIndexOf('polisher')
  );

  if (synthIdx > toolIdx && synthIdx > -1) {
    return 'synthesizing';
  }
  
  if (toolIdx > -1) {
    return 'tool_evaluating';
  }
  
  return 'analyzing';
}

const PHASE_CONFIG: Record<ThinkingPhase, { label: string; color: string; icon: string }> = {
  analyzing:      { label: 'Analyzing',        color: '#818CF8',              icon: '◎' },
  tool_evaluating:{ label: 'Evaluating Tools', color: '#F59E0B',              icon: '⚡' },
  synthesizing:   { label: 'Synthesizing',     color: '#34D399',              icon: '✦' },
  complete:       { label: 'Complete',         color: 'rgba(255,255,255,0.3)', icon: '✓' },
};

// Parse structured thinking content into typed segments
type Segment =
  | { type: 'section'; label: string; icon: string }
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_end'; agent: string }
  | { type: 'task_start'; index: string; agent: string; task: string }
  | { type: 'dynamic_spawn'; agent: string; task: string }
  | { type: 'batch_complete' }
  | { type: 'tool_call'; agent: string; tool: string; args: string }
  | { type: 'tool_result'; preview: string }
  | { type: 'plan'; agents: string[] }
  | { type: 'agent_progress'; step: number; total: number; agents?: string[]; currentAgent?: string; elapsed?: number }
  | { type: 'text'; content: string };

const AGENT_MAPPING: Record<string, string> = {
  web_explorer: 'Web Explorer',
  doc_cruncher: 'Document Cruncher',
  code_interpreter: 'Code Interpreter',
  deep_planner: 'Deep Planner',
  deep_research: 'Deep Research',
  persona_polisher: 'Persona & Polisher',
};

function normalizeAgent(name: string): string {
  const trimmed = name.trim();
  const mapped = AGENT_MAPPING[trimmed] || AGENT_MAPPING[trimmed.toLowerCase().replace(/\s+/g, '_')];
  if (mapped) return mapped;
  return trimmed.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function parseThinking(raw: string): Segment[] {
  // Fast path for massive strings without our custom agent markers to avoid freezing the UI
  if (raw.length > 10000 && !raw.includes('━━━') && !raw.includes('┌─') && !raw.includes('⚡') && !raw.includes('📋') && !raw.includes('Plan:') && !raw.includes('Agent turn') && !raw.includes('Executing tool')) {
    return [{ type: 'text', content: raw }];
  }

  const lines = raw.split('\n');
  const segments: Segment[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Agent turn header: Agent turn 1/15…
    const turnMatch = t.match(/^Agent\s+turn\s+(\d+)\/(\d+)/i);
    if (turnMatch) {
      segments.push({ type: 'section', label: `Agent Turn ${turnMatch[1]}/${turnMatch[2]}`, icon: '🔄' });
      continue;
    }

    // Tool call: Executing tool: web_search...
    const execToolMatch = t.match(/^Executing\s+tool:\s*(\w+)/i);
    if (execToolMatch) {
      segments.push({ type: 'tool_call', agent: 'Agent', tool: execToolMatch[1], args: '' });
      continue;
    }

    // Tool result: Tool result received.
    if (t.toLowerCase().includes('tool result received')) {
      segments.push({ type: 'tool_result', preview: 'Result received successfully.' });
      continue;
    }

    // Section header: 🔄 [ReAct Loop] Iteration 1
    const reactLoopMatch = t.match(/🔄\s+\[ReAct\s+Loop\]\s+Iteration\s+(\d+)/i);
    if (reactLoopMatch) {
      segments.push({ type: 'section', label: `ReAct Loop Iteration ${reactLoopMatch[1]}`, icon: '🔄' });
      continue;
    }

    // Tool call: 🛠️ [Executing Tool] web_search ({...})
    const tauriExecToolMatch = t.match(/🛠️\s+\[Executing\s+Tool\]\s+(\w+)\s*\((.*?)\)/i);
    if (tauriExecToolMatch) {
      segments.push({ type: 'tool_call', agent: 'Agent', tool: tauriExecToolMatch[1], args: tauriExecToolMatch[2] || '' });
      continue;
    }

    // Connection messages
    if (t.startsWith('━━━') || t.includes('Routing') || t.includes('Supervisor')) {
      segments.push({ type: 'section', label: t, icon: 'globe' });
      continue;
    }

    // section header: ━━━ [Label] Text ━━━
    const sec = t.match(/^[━]+\s+\[(.+?)\]\s+(.+?)\s+[━]+$/);
    if (sec) {
      const label = sec[1] + ' ' + sec[2].replace(/\.\.\.$/, '').trim();
      const icon = label.includes('Supervisor') || label.includes('Routing') ? 'brain'
        : label.includes('Polisher') || label.includes('Crafting') ? 'sparkle'
        : label.includes('Synthesis') ? 'link'
        : label.includes('Running') ? 'lightning'
        : 'arrows_clockwise';
      segments.push({ type: 'section', label, icon });
      continue;
    }
    // plan: 🗺️ Plan: a → b
    const plan = t.match(/Plan:\s+(.+)$/);
    if (plan) {
      const agents = plan[1].split(/\s*[→>]\s*/).map((a: string) => normalizeAgent(a)).filter(Boolean);
      segments.push({ type: 'plan', agents });
      continue;
    }
    // agent start: ┌─ [Name] ...
    const astart = t.match(/^[┌├]─\s+\[(.+?)\]/);
    if (astart) { segments.push({ type: 'agent_start', agent: normalizeAgent(astart[1]) }); continue; }
    // agent end: └─ [Name] ...
    const aend = t.match(/^└─\s+\[(.+?)\]/);
    if (aend) { segments.push({ type: 'agent_end', agent: normalizeAgent(aend[1]) }); continue; }
    // task start: ┌─ Task 1 (web_explorer): ...
    const taskStart = t.match(/^[┌├]─\s+Task\s+(\d+)\s+\((.+?)\):\s*(.*)$/);
    if (taskStart) {
      segments.push({ type: 'task_start', index: taskStart[1], agent: normalizeAgent(taskStart[2]), task: taskStart[3] });
      continue;
    }
    // dynamic spawn: ├─ \u26A1 Dynamically spawning sub-agent: web_explorer for: task instructions
    const dynamicSpawn = t.match(/^[┌├]─\s+\u26A1\s+Dynamically spawning sub-agent:\s*(.+?)\s+for:\s*(.*)$/);
    if (dynamicSpawn) {
      segments.push({ type: 'dynamic_spawn', agent: normalizeAgent(dynamicSpawn[1]), task: dynamicSpawn[2] });
      continue;
    }
    // batch complete: └─ Batch complete.
    if (/^└─\s+Batch\s+complete\./.test(t)) {
      segments.push({ type: 'batch_complete' });
      continue;
    }
    // tool call: \u26A1 [Name] → tool(args)
    const tc = t.match(/^\u26A1\s+\[(.+?)\]\s+[→>]\s+(\w+)\((.*)?\)$/);
    if (tc) { segments.push({ type: 'tool_call', agent: normalizeAgent(tc[1]), tool: tc[2], args: tc[3] || '' }); continue; }
    // tool result: \uD83D\uDCCB Result: ...
    const tr = t.match(/^\uD83D\uDCCB\s+Result:\s+(.+)$/);
    if (tr) { segments.push({ type: 'tool_result', preview: tr[1] }); continue; }
    // plain text
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') { prev.content += '\n' + t; }
    else { segments.push({ type: 'text', content: t }); }
  }
  return segments;
}

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Web Explorer':       { bg: 'rgba(59,130,246,0.12)',  text: '#60A5FA', border: 'rgba(59,130,246,0.3)' },
  'Deep Planner':       { bg: 'rgba(168,85,247,0.12)',  text: '#C084FC', border: 'rgba(168,85,247,0.3)' },
  'Code Interpreter':   { bg: 'rgba(16,185,129,0.12)',  text: '#34D399', border: 'rgba(16,185,129,0.3)' },
  'Document Cruncher':  { bg: 'rgba(245,158,11,0.12)',  text: '#FBBF24', border: 'rgba(245,158,11,0.3)' },
  'Deep Research':      { bg: 'rgba(45,212,191,0.12)',  text: '#2DD4BF', border: 'rgba(45,212,191,0.3)' },
  'Persona & Polisher': { bg: 'rgba(244,63,94,0.12)',   text: '#FB7185', border: 'rgba(244,63,94,0.3)' },
};

const AGENT_ICONS: Record<string, string> = {
  'Web Explorer': 'globe',
  'Deep Planner': 'puzzle_piece',
  'Code Interpreter': 'code',
  'Document Cruncher': 'file_text',
  'Deep Research': 'microscope',
  'Persona & Polisher': 'sparkle',
};

function getAgentColor(agent: string) {
  return AGENT_COLORS[agent] || { bg: 'rgba(255,255,255,0.06)', text: '#94A3B8', border: 'rgba(255,255,255,0.1)' };
}

const SectionHeader: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2 py-2">
    <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
    <span className="text-[9px] font-mono font-medium tracking-widest uppercase px-1 flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.22)' }}>
      {getIconFromEmoji(icon)} {label}
    </span>
    <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
  </div>
);

const PlanPill: React.FC<{ agents: string[] }> = ({ agents }) => (
  <div className="flex items-center gap-1.5 flex-wrap py-1">
    {agents.map((a, i) => {
      const normAgent = normalizeAgent(a);
      const c = getAgentColor(normAgent);
      return (
        <React.Fragment key={a}>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
            {getIconFromEmoji(AGENT_ICONS[normAgent], "w-3 h-3") || '•'} {normAgent}
          </span>
          {i < agents.length - 1 && <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10 }}>→</span>}
        </React.Fragment>
      );
    })}
  </div>
);

const AgentBadge: React.FC<{ agent: string; status: 'running' | 'done' }> = ({ agent, status }) => {
  const normAgent = normalizeAgent(agent);
  const c = getAgentColor(normAgent);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
        {status === 'running' ? (
          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>●</motion.span>
        ) : <span>✓</span>}
        {getIconFromEmoji(AGENT_ICONS[normAgent], "w-3 h-3")} {normAgent}
      </span>
      <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.22)' }}>
        {status === 'running' ? 'working...' : 'complete'}
      </span>
    </div>
  );
};

const TaskStartRow: React.FC<{ index: string; agent: string; task: string }> = ({ index, agent, task }) => {
  const normAgent = normalizeAgent(agent);
  const c = getAgentColor(normAgent);
  return (
    <div className="flex items-start gap-2.5 py-1 pl-1">
      <span className="text-[10px] font-mono text-muted-foreground shrink-0 pt-0.5 select-none">Task {index}:</span>
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
        {getIconFromEmoji(AGENT_ICONS[normAgent], "w-3 h-3") || '•'} {normAgent}
      </span>
      <span className="text-[11px] font-mono text-foreground/75 leading-relaxed">{task}</span>
    </div>
  );
};

const DynamicSpawnRow: React.FC<{ agent: string; task: string }> = ({ agent, task }) => {
  const normAgent = normalizeAgent(agent);
  const c = getAgentColor(normAgent);
  return (
    <div className="flex items-start gap-2.5 py-1.5 pl-3 bg-indigo-500/5 rounded-lg border border-indigo-500/10 my-1.5">
      <span className="text-[10px] shrink-0 pt-0.5 animate-pulse select-none text-indigo-400">
        <Lightning className="w-3.5 h-3.5" />
      </span>
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
        {getIconFromEmoji(AGENT_ICONS[normAgent], "w-3 h-3") || '•'} {normAgent}
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] font-mono text-indigo-300 uppercase tracking-wider select-none font-bold">Dynamically Spawned</span>
        <span className="text-[11px] font-mono text-foreground/80 leading-relaxed mt-0.5">{task}</span>
      </div>
    </div>
  );
};

const BatchCompleteRow: React.FC = () => (
  <div className="flex items-center gap-2 py-2 select-none">
    <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
    <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400/70 font-semibold">
      ✓ Parallel Batch Complete
    </span>
    <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
  </div>
);

const ToolCallRow: React.FC<{ agent: string; tool: string; args: string }> = ({ agent, tool, args }) => {
  const normAgent = normalizeAgent(agent);
  const c = getAgentColor(normAgent);
  let argPreview = args;
  try { const p = JSON.parse(args); argPreview = p.query || p.command || p.path || args; } catch {}
  if (argPreview.length > 60) argPreview = argPreview.slice(0, 57) + '...';
  return (
    <div className="flex items-center gap-2 pl-3 py-0.5">
      <div className="w-px h-4 shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <span className="text-[10px] font-mono font-medium px-1.5 py-px rounded" style={{ background: c.bg, color: c.text }}>{tool}</span>
      {argPreview && <span className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>({argPreview})</span>}
    </div>
  );
};

const ToolResultRow: React.FC<{ preview: string }> = ({ preview }) => (
  <div className="flex items-center gap-2 pl-3 py-0.5">
    <div className="w-px h-3 shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
    <span className="text-[10px] font-mono truncate max-w-[90%]" style={{ color: 'rgba(52,211,153,0.6)' }}>
      ↳ {preview.length > 80 ? preview.slice(0, 77) + '...' : preview}
    </span>
  </div>
);

const PlainText: React.FC<{ content: string }> = ({ content }) => {
  if (!content.trim()) return null;
  return (
    <div className="text-[13px] font-sans leading-relaxed py-1 animate-fade-in text-muted-foreground border-l border-muted-foreground/20 pl-3 ml-1" style={{ whiteSpace: 'pre-wrap' }}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]} 
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';

function AgentProgressBar({
  step,
  total,
  currentAgent,
  elapsed,
}: {
  step: number;
  total: number;
  currentAgent?: string;
  elapsed?: number;
}) {
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;
  const elapsedSec = elapsed ? Math.round(elapsed / 1000) : 0;
  const agentLabel = currentAgent?.replace(/_/g, ' ') ?? '';

  return (
    <div className="my-2 mx-1 px-3 py-2 rounded-lg bg-zinc-900/70 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-zinc-400">
          Agent {step}/{total}
          {agentLabel && (
            <span className="ml-2 text-violet-400 capitalize">{agentLabel}</span>
          )}
        </span>
        {elapsedSec > 0 && (
          <span className="text-[11px] text-zinc-600 font-mono">{elapsedSec}s</span>
        )}
      </div>
      <div className="h-[3px] bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, responseContent, isComplete = true, startedAt, agentProgress }) => {
  const [isExpanded, setIsExpanded] = useState(!isComplete);
  const smoothContent = useSmoothTypewriter(content, !isComplete);
  const showReasoning = useNyxStore((s) => s.showReasoning);
  const setShowReasoning = useNyxStore((s) => s.setShowReasoning);
  const segments = useMemo(() => parseThinking(smoothContent), [smoothContent]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [internalStartedAt] = useState(() => startedAt || Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isComplete) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - internalStartedAt);
    }, 100);
    return () => clearInterval(interval);
  }, [isComplete, internalStartedAt]);

  const currentPhase: ThinkingPhase = useMemo(() => {
    if (isComplete) return 'complete';
    return detectPhase(smoothContent);
  }, [smoothContent, isComplete]);

  const currentStatusText = useMemo(() => {
    if (isComplete) return 'Complete';
    
    // Find the most recent active agent, tool, or text
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.type === 'tool_call') {
        return `${s.agent} running ${s.tool}...`;
      }
      if (s.type === 'agent_start') {
        return `${s.agent} is working...`;
      }
      if (s.type === 'dynamic_spawn') {
        return `Spawning ${s.agent}...`;
      }
      if (s.type === 'text' && s.content.trim()) {
        const clean = s.content.replace(/\s+/g, ' ').trim();
        
        // Skip system/backend connection messages from the dynamic header
        if (clean.includes('Connecting to backend agent service')) continue;
        
        if (clean.length <= 60) return clean;
        return '...' + clean.slice(-55).trim();
      }
    }
    
    return PHASE_CONFIG[currentPhase].label;
  }, [segments, isComplete, currentPhase]);

  const userScrolledUp = useRef(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 50;
  };

  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, isExpanded]);

  if (!content?.trim()) return null;

  if (!showReasoning) {
    const timeSecs = elapsedMs > 0 ? (elapsedMs / 1000).toFixed(1) : ((Date.now() - internalStartedAt) / 1000).toFixed(1);
    return (
      <div className="my-2 text-[12px] text-muted-foreground/80 flex items-center gap-1.5 font-sans select-none">
        <span className="text-indigo-400">◎</span>
        <span>
          {isComplete 
            ? `Reasoned for ${timeSecs}s` 
            : `Reasoning... (${timeSecs}s)`
          }
        </span>
        <button 
          onClick={() => setShowReasoning(true)}
          className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 cursor-pointer outline-none bg-transparent border-none p-0 ml-1 transition-colors"
        >
          (show)
        </button>
      </div>
    );
  }

  const spring = { duration: 0.2, ease: 'easeOut' as const };
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="my-2 mb-4 overflow-hidden"
    >
      <motion.button
        onClick={() => setIsExpanded(v => !v)}
        whileHover={{ opacity: 0.8 }}
        whileTap={{ scale: 0.995 }}
        transition={spring}
        className="flex items-center gap-2 outline-none cursor-pointer group"
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted/40 group-hover:bg-muted/60 transition-colors">
          {!isComplete ? (
            <motion.div
              animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: PHASE_CONFIG[currentPhase].color }}
            />
          ) : (
            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={spring}>
              <CaretDown weight="bold" className="w-3 h-3 text-muted-foreground" />
            </motion.div>
          )}
        </div>
        
        <div className="flex flex-col text-left">
          <span className="text-[13px] font-sans font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            {!isComplete ? currentStatusText : 'Thinking Process'}
          </span>
        </div>

        {(elapsedMs > 0 || isComplete) && (
          <div className="flex items-center gap-2 ml-1">
            <span className="text-[11px] font-sans text-muted-foreground/60">
              {((elapsedMs || (Date.now() - internalStartedAt)) / 1000).toFixed(1)}s
              {content && ` • ${Math.round(content.length / 4)} tokens reasoning`}
              {responseContent && ` • ${Math.round(responseContent.length / 4)} tokens response`}
            </span>
          </div>
        )}
      </motion.button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            {agentProgress && agentProgress.total > 0 && (
              <AgentProgressBar
                step={agentProgress.step}
                total={agentProgress.total}
                currentAgent={agentProgress.currentAgent}
                elapsed={agentProgress.elapsed}
              />
            )}
            <div ref={scrollRef} onScroll={handleScroll} className="ml-2.5 pl-4 pb-2 pt-2 mt-2 space-y-1 max-h-[600px] overflow-y-auto overscroll-contain border-l border-border/40">
              {segments.map((seg, i) => {
                switch (seg.type) {
                  case 'section':    return <SectionHeader key={i} icon={seg.icon} label={seg.label} />;
                  case 'plan':       return <PlanPill key={i} agents={seg.agents} />;
                  case 'agent_start':return <AgentBadge key={i} agent={seg.agent} status="running" />;
                  case 'agent_end':  return <AgentBadge key={i} agent={seg.agent} status="done" />;
                  case 'task_start': return <TaskStartRow key={i} index={seg.index} agent={seg.agent} task={seg.task} />;
                  case 'dynamic_spawn': return <DynamicSpawnRow key={i} agent={seg.agent} task={seg.task} />;
                  case 'batch_complete': return <BatchCompleteRow key={i} />;
                  case 'tool_call':  return <ToolCallRow key={i} agent={seg.agent} tool={seg.tool} args={seg.args} />;
                  case 'tool_result':return <ToolResultRow key={i} preview={seg.preview} />;
                  case 'text':       return <PlainText key={i} content={seg.content} />;
                  default:           return null;
                }
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
