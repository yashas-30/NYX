import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CaretDown } from '@phosphor-icons/react';

interface ThinkingBlockProps {
  content: string;
  isComplete?: boolean;
  startedAt?: number;
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
  if (raw.length > 500 && !raw.includes('━━━') && !raw.includes('┌─') && !raw.includes('⚡') && !raw.includes('📋') && !raw.includes('Plan:')) {
    return [{ type: 'text', content: raw }];
  }

  const lines = raw.split('\n');
  const segments: Segment[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // section header: ━━━ [Label] Text ━━━
    const sec = t.match(/^[━]+\s+\[(.+?)\]\s+(.+?)\s+[━]+$/);
    if (sec) {
      const label = sec[1] + ' ' + sec[2].replace(/\.\.\.$/, '').trim();
      const icon = label.includes('Supervisor') || label.includes('Routing') ? '🧠'
        : label.includes('Polisher') || label.includes('Crafting') ? '✨'
        : label.includes('Synthesis') ? '🔗'
        : label.includes('Running') ? '⚡'
        : '🔄';
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
    // dynamic spawn: ├─ ⚡ Dynamically spawning sub-agent: web_explorer for: task instructions
    const dynamicSpawn = t.match(/^[┌├]─\s+⚡\s+Dynamically spawning sub-agent:\s*(.+?)\s+for:\s*(.*)$/);
    if (dynamicSpawn) {
      segments.push({ type: 'dynamic_spawn', agent: normalizeAgent(dynamicSpawn[1]), task: dynamicSpawn[2] });
      continue;
    }
    // batch complete: └─ Batch complete.
    if (/^└─\s+Batch\s+complete\./.test(t)) {
      segments.push({ type: 'batch_complete' });
      continue;
    }
    // tool call: ⚡ [Name] → tool(args)
    const tc = t.match(/^⚡\s+\[(.+?)\]\s+[→>]\s+(\w+)\((.*)?\)$/);
    if (tc) { segments.push({ type: 'tool_call', agent: normalizeAgent(tc[1]), tool: tc[2], args: tc[3] || '' }); continue; }
    // tool result: 📋 Result: ...
    const tr = t.match(/^📋\s+Result:\s+(.+)$/);
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
  'Web Explorer': '🌐',
  'Deep Planner': '🧩',
  'Code Interpreter': '💻',
  'Document Cruncher': '📄',
  'Deep Research': '🔬',
  'Persona & Polisher': '✨',
};

function getAgentColor(agent: string) {
  return AGENT_COLORS[agent] || { bg: 'rgba(255,255,255,0.06)', text: '#94A3B8', border: 'rgba(255,255,255,0.1)' };
}

const SectionHeader: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2 py-2">
    <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
    <span className="text-[9px] font-mono font-medium tracking-widest uppercase px-1" style={{ color: 'rgba(255,255,255,0.22)' }}>
      {icon} {label}
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
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
            {AGENT_ICONS[normAgent] || '•'} {normAgent}
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
        {AGENT_ICONS[normAgent] || ''} {normAgent}
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
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shrink-0"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
        {AGENT_ICONS[normAgent] || '•'} {normAgent}
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
      <span className="text-[10px] shrink-0 pt-0.5 animate-pulse select-none">⚡</span>
      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shrink-0"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
        {AGENT_ICONS[normAgent] || '•'} {normAgent}
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
    <p className="text-[11px] font-mono leading-relaxed py-0.5 whitespace-pre-wrap animate-fade-in" style={{ color: 'rgba(255,255,255,0.28)' }}>
      {content}
    </p>
  );
};

import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, isComplete = true, startedAt }) => {
  const [isExpanded, setIsExpanded] = useState(!isComplete);
  const smoothContent = useSmoothTypewriter(content, !isComplete);
  const segments = useMemo(() => parseThinking(smoothContent), [smoothContent]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentPhase: ThinkingPhase = useMemo(() => {
    if (isComplete) return 'complete';
    return detectPhase(smoothContent);
  }, [smoothContent, isComplete]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, isExpanded]);

  if (!content?.trim()) return null;
  const spring = { duration: 0.2, ease: 'easeOut' as const };
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="my-3 overflow-hidden rounded-xl border bg-card/60 backdrop-blur-md"
      style={{ borderColor: 'var(--border)' }}
    >
      <motion.button
        onClick={() => setIsExpanded(v => !v)}
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
        whileTap={{ scale: 0.995 }}
        transition={spring}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left outline-none cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          {!isComplete && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: PHASE_CONFIG[currentPhase].color }}
            />
          )}
          <div className="flex flex-col">
            <span className="text-[11px] font-mono font-medium tracking-tight"
              style={{ color: !isComplete ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)' }}>
              {!isComplete ? 'Thinking…' : 'Reasoning process'}
            </span>
            {!isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1.5 mt-0.5"
              >
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{ color: PHASE_CONFIG[currentPhase].color, fontSize: 9 }}
                >
                  {PHASE_CONFIG[currentPhase].icon}
                </motion.span>
                <span style={{ color: PHASE_CONFIG[currentPhase].color, fontSize: 9, fontFamily: 'monospace' }}>
                  {PHASE_CONFIG[currentPhase].label}
                </span>
              </motion.div>
            )}
          </div>
        </div>
        <div className="flex items-center">
          {isComplete && content && (
            <div className="flex items-center gap-2 mr-2">
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>
                ~{Math.round(content.length / 4).toLocaleString()} tokens
              </span>
            </div>
          )}
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={spring}>
            <CaretDown weight="bold" className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
          </motion.div>
        </div>
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
            <div ref={scrollRef} className="px-4 pb-4 pt-2 space-y-0.5 max-h-[600px] overflow-y-auto overscroll-contain" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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
